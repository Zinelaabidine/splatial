#!/usr/bin/env python3
"""
COLMAP dataset converter (Splatial fork)
----------------------------------------
Wrapper around COLMAP that runs feature extraction, matching, mapper, and
image undistortion to produce the layout expected by gaussian-splatting
train.py (input/ -> sparse/0/, images/).

Requires COLMAP 4.x built with CUDA. COLMAP 4.0+ renamed GPU flags:
  - SiftExtraction.use_gpu  -> FeatureExtraction.use_gpu
  - SiftMatching.use_gpu    -> FeatureMatching.use_gpu

Performance notes (roughly highest impact first)
------------------------------------------------
1. Matcher choice (dominant cost for most datasets)
   - sequential   : ordered video / walkthrough frames (default). O(n * overlap).
   - exhaustive   : unordered photos, best quality, O(n^2). OK up to ~150 images.
   - vocab_tree   : large unordered sets (100s–1000s). Needs a vocab tree .bin file.

2. GPU matching / extraction
   - Do not pass --no_gpu on CUDA-enabled COLMAP builds.
   - Set COLMAP_EXECUTABLE if colmap is not on PATH.

3. Feature extraction caps (defaults tuned for speed vs quality)
   - --max_image_size 1600     (COLMAP default 3200; halving size ~4x faster extraction)
   - --max_num_features 4096   (COLMAP default 8192)

4. Mapper bundle adjustment
   - --ba_tolerance 0.0001      (script default; original Inria script used 0.000001)

5. Fewer images
   - Drop near-duplicate frames before running; matching cost scales quadratically
     with exhaustive matcher and linearly with image count otherwise.

6. Reuse prior work
   - --skip_matching skips extraction/matching/mapper if database + sparse exist.

Usage examples
--------------
# Ordered video frames (fast default path)
python convert.py -s /path/to/scene

# Unordered photo collection (best quality, slower)
python convert.py -s /path/to/scene --matcher exhaustive

# Large unordered set with vocab tree (download once from COLMAP releases)
python convert.py -s /path/to/scene --matcher vocab_tree \\
    --vocab_tree_path /opt/colmap/vocab_tree_flickr100K_words256K.bin

# Faster / rougher reconstruction
python convert.py -s /path/to/scene --max_image_size 1200 --max_num_features 2048

# CPU-only fallback (very slow)
python convert.py -s /path/to/scene --no_gpu

# Re-run undistortion only after a successful COLMAP pass
python convert.py -s /path/to/scene --skip_matching

# Custom COLMAP binary
python convert.py -s /path/to/scene --colmap_executable /usr/local/bin/colmap

Expected scene layout
---------------------
  scene/
    input/          <- source images (created by worker if images are at scene root)
    distorted/      <- COLMAP working files (database, sparse)
    sparse/0/       <- final cameras + points for train.py
    images/         <- undistorted images for train.py

Worker integration
------------------
worker.py invokes this script co-located in the worker/ directory. Tune via env vars:
  COLMAP_EXECUTABLE, COLMAP_NO_GPU, COLMAP_MATCHER, COLMAP_MAX_IMAGE_SIZE,
  COLMAP_MAX_NUM_FEATURES, COLMAP_SEQUENTIAL_OVERLAP, COLMAP_BA_TOLERANCE,
  COLMAP_VOCAB_TREE_PATH
"""

import logging
import os
import shutil
from argparse import ArgumentParser

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

parser = ArgumentParser("Colmap converter")
parser.add_argument("--no_gpu", action="store_true")
parser.add_argument("--skip_matching", action="store_true")
parser.add_argument("--source_path", "-s", required=True, type=str)
parser.add_argument("--camera", default="OPENCV", type=str)
parser.add_argument("--colmap_executable", default="", type=str)
parser.add_argument("--resize", action="store_true")
parser.add_argument("--magick_executable", default="", type=str)
parser.add_argument(
    "--matcher",
    default="sequential",
    choices=["exhaustive", "sequential", "vocab_tree"],
    help="exhaustive: best quality, slow O(n^2). sequential: fast for ordered video frames. "
    "vocab_tree: fast for large unordered sets.",
)
parser.add_argument(
    "--vocab_tree_path",
    default="",
    type=str,
    help="Required when --matcher vocab_tree (download vocab_tree_flickr100K_words256K.bin from COLMAP).",
)
parser.add_argument(
    "--sequential_overlap",
    default=10,
    type=int,
    help="Number of neighboring images to match (sequential_matcher only).",
)
parser.add_argument(
    "--max_image_size",
    default=1600,
    type=int,
    help="Downscale images before feature extraction (default 1600; COLMAP default is 3200).",
)
parser.add_argument(
    "--max_num_features",
    default=4096,
    type=int,
    help="Max SIFT features per image (default 4096; COLMAP default is 8192).",
)
parser.add_argument(
    "--ba_tolerance",
    default=0.0001,
    type=float,
    help="Mapper BA stop tolerance (higher = faster, looser poses).",
)
args = parser.parse_args()

colmap_command = '"{}"'.format(args.colmap_executable) if args.colmap_executable else "colmap"
magick_command = '"{}"'.format(args.magick_executable) if args.magick_executable else "magick"
use_gpu = 0 if args.no_gpu else 1

if not args.skip_matching:
    os.makedirs(os.path.join(args.source_path, "distorted", "sparse"), exist_ok=True)

    feat_extracton_cmd = (
        colmap_command
        + " feature_extractor \
        --database_path "
        + args.source_path
        + "/distorted/database.db \
        --image_path "
        + args.source_path
        + "/input \
        --ImageReader.single_camera 1 \
        --ImageReader.camera_model "
        + args.camera
        + " \
        --FeatureExtraction.use_gpu "
        + str(use_gpu)
        + " \
        --FeatureExtraction.max_image_size "
        + str(args.max_image_size)
        + " \
        --SiftExtraction.max_num_features "
        + str(args.max_num_features)
    )
    exit_code = os.system(feat_extracton_cmd)
    if exit_code != 0:
        logging.error("Feature extraction failed with code %s. Exiting.", exit_code)
        raise SystemExit(exit_code)

    if args.matcher == "exhaustive":
        feat_matching_cmd = (
            colmap_command
            + " exhaustive_matcher \
            --database_path "
            + args.source_path
            + "/distorted/database.db \
            --FeatureMatching.use_gpu "
            + str(use_gpu)
        )
    elif args.matcher == "sequential":
        feat_matching_cmd = (
            colmap_command
            + " sequential_matcher \
            --database_path "
            + args.source_path
            + "/distorted/database.db \
            --FeatureMatching.use_gpu "
            + str(use_gpu)
            + " \
            --SequentialMatching.overlap "
            + str(args.sequential_overlap)
        )
    else:
        if not args.vocab_tree_path:
            logging.error("--vocab_tree_path is required when --matcher vocab_tree")
            raise SystemExit(1)
        feat_matching_cmd = (
            colmap_command
            + " vocab_tree_matcher \
            --database_path "
            + args.source_path
            + "/distorted/database.db \
            --FeatureMatching.use_gpu "
            + str(use_gpu)
            + " \
            --VocabTreeMatching.vocab_tree_path "
            + args.vocab_tree_path
        )

    exit_code = os.system(feat_matching_cmd)
    if exit_code != 0:
        logging.error("Feature matching failed with code %s. Exiting.", exit_code)
        raise SystemExit(exit_code)

    mapper_cmd = (
        colmap_command
        + " mapper \
        --database_path "
        + args.source_path
        + "/distorted/database.db \
        --image_path "
        + args.source_path
        + "/input \
        --output_path "
        + args.source_path
        + "/distorted/sparse \
        --Mapper.ba_global_function_tolerance="
        + str(args.ba_tolerance)
    )
    exit_code = os.system(mapper_cmd)
    if exit_code != 0:
        logging.error("Mapper failed with code %s. Exiting.", exit_code)
        raise SystemExit(exit_code)

img_undist_cmd = (
    colmap_command
    + " image_undistorter \
    --image_path "
    + args.source_path
    + "/input \
    --input_path "
    + args.source_path
    + "/distorted/sparse/0 \
    --output_path "
    + args.source_path
    + " \
    --output_type COLMAP"
)
exit_code = os.system(img_undist_cmd)
if exit_code != 0:
    logging.error("Image undistortion failed with code %s. Exiting.", exit_code)
    raise SystemExit(exit_code)

files = os.listdir(os.path.join(args.source_path, "sparse"))
os.makedirs(os.path.join(args.source_path, "sparse", "0"), exist_ok=True)
for file in files:
    if file == "0":
        continue
    source_file = os.path.join(args.source_path, "sparse", file)
    destination_file = os.path.join(args.source_path, "sparse", "0", file)
    shutil.move(source_file, destination_file)

if args.resize:
    print("Copying and resizing...")

    os.makedirs(os.path.join(args.source_path, "images_2"), exist_ok=True)
    os.makedirs(os.path.join(args.source_path, "images_4"), exist_ok=True)
    os.makedirs(os.path.join(args.source_path, "images_8"), exist_ok=True)
    files = os.listdir(os.path.join(args.source_path, "images"))
    for file in files:
        source_file = os.path.join(args.source_path, "images", file)

        destination_file = os.path.join(args.source_path, "images_2", file)
        shutil.copy2(source_file, destination_file)
        exit_code = os.system(magick_command + " mogrify -resize 50% " + destination_file)
        if exit_code != 0:
            logging.error("50%% resize failed with code %s. Exiting.", exit_code)
            raise SystemExit(exit_code)

        destination_file = os.path.join(args.source_path, "images_4", file)
        shutil.copy2(source_file, destination_file)
        exit_code = os.system(magick_command + " mogrify -resize 25% " + destination_file)
        if exit_code != 0:
            logging.error("25%% resize failed with code %s. Exiting.", exit_code)
            raise SystemExit(exit_code)

        destination_file = os.path.join(args.source_path, "images_8", file)
        shutil.copy2(source_file, destination_file)
        exit_code = os.system(magick_command + " mogrify -resize 12.5% " + destination_file)
        if exit_code != 0:
            logging.error("12.5%% resize failed with code %s. Exiting.", exit_code)
            raise SystemExit(exit_code)

print("Done.")

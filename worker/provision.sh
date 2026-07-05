#!/usr/bin/env bash
# provision.sh — from-scratch GPU worker provisioning recipe.
#
# WHY THIS EXISTS
#   The routine AMI bake (.github/workflows/bake-worker-ami.yml) is incremental:
#   it launches an instance from the CURRENT registered worker AMI and only
#   overwrites worker.py / convert.py / imds_extract.py / the systemd unit, then
#   re-bakes. That's fast and cheap, but it means the AMI's base layer (NVIDIA
#   driver, Miniconda, the `gaussian_splatting` conda env, COLMAP/GLOMAP) only
#   ever gets carried forward, never rebuilt. Drift and cruft accumulate.
#
#   This script is the escape hatch: the documented, from-zero recipe to
#   rebuild that base layer on a clean AMI (e.g. AWS Deep Learning Base AMI for
#   ARM64/Graviton + NVIDIA GPU). Run it manually on an occasional "golden
#   rebase" — quarterly, or whenever the incremental chain looks suspect — then
#   register the resulting AMI and switch the bake workflow's base_ami_id to
#   point at it going forward.
#
# STATUS: scaffold, not yet fully verified end-to-end. The exact CUDA/PyTorch/
#   COLMAP/GLOMAP build flags currently only exist baked into the live AMI
#   (ami-0a6913682d6d953eb) — there was no from-scratch build recipe checked
#   into the repo before this file. Sections below marked TODO need to be
#   filled in and tested against that AMI (or by whoever originally built it)
#   before this script can be trusted for an unattended rebuild.
#
# Usage (on the builder instance, via SSM or console):
#   sudo bash provision.sh
#
set -euo pipefail

WORKER_USER="ubuntu"
WORKER_HOME="/home/${WORKER_USER}"
PROJECT_DIR="${WORKER_HOME}/gaussian-splatting"
CONDA_DIR="${WORKER_HOME}/miniconda3"
CONDA_ENV_NAME="gaussian_splatting"

echo "== provision.sh: from-scratch worker provisioning =="

# ── 1. OS packages ────────────────────────────────────────────────────────────
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  build-essential \
  git \
  curl \
  wget \
  unzip \
  ca-certificates \
  cmake \
  ninja-build

# ── 2. NVIDIA driver / CUDA ───────────────────────────────────────────────────
# TODO: verify against the base AMI. If starting from an AWS Deep Learning Base
# AMI (Ubuntu, ARM64/Graviton + NVIDIA T4G), drivers and CUDA toolkit are
# already present — confirm with `nvidia-smi` and `nvcc --version` before
# assuming a driver install is needed here. Do not attempt a driver install on
# an instance that already has one; mismatched driver/CUDA versions are the
# most common cause of a silently-broken bake.
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "nvidia-smi not found — this base image does not include NVIDIA drivers."
  echo "TODO: install the driver/CUDA toolkit matching the g5g (T4G/ARM64) GPU," \
       "or start from a base AMI that already includes them."
  exit 1
fi
nvidia-smi

# ── 3. Miniconda ──────────────────────────────────────────────────────────────
if [ ! -d "${CONDA_DIR}" ]; then
  ARCH="$(uname -m)"  # aarch64 on Graviton
  curl -fsSL "https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-${ARCH}.sh" \
    -o /tmp/miniconda.sh
  sudo -u "${WORKER_USER}" bash /tmp/miniconda.sh -b -p "${CONDA_DIR}"
  rm -f /tmp/miniconda.sh
fi

# ── 4. Conda environment ──────────────────────────────────────────────────────
# TODO: this repo does not currently check in an environment.yml for the
# gaussian_splatting env. Reconstruct one from the live AMI
# (`conda env export -n gaussian_splatting > environment.yml` on an existing
# worker instance via SSM) and commit it alongside this script — then replace
# the block below with:
#   sudo -u "${WORKER_USER}" "${CONDA_DIR}/bin/conda" env create \
#     -n "${CONDA_ENV_NAME}" -f "${PROJECT_DIR}/environment.yml"
if ! "${CONDA_DIR}/bin/conda" env list | grep -q "${CONDA_ENV_NAME}"; then
  echo "TODO: create the ${CONDA_ENV_NAME} conda env (PyTorch + CUDA + gsplat /"
  echo "diff-gaussian-rasterization + COLMAP/GLOMAP python bindings)."
  echo "No environment.yml is checked in yet — see TODO above."
  exit 1
fi

# ── 5. COLMAP / GLOMAP ────────────────────────────────────────────────────────
# TODO: worker/convert.py requires COLMAP 4.x built with CUDA support
# (see worker/worker.py module docstring: COLMAP 4.0+ renamed
# SiftExtraction.use_gpu -> FeatureExtraction.use_gpu, etc). Document the exact
# build (apt package vs. from-source CMake build) once confirmed against the
# live AMI, and add the steps here.
if ! command -v colmap >/dev/null 2>&1; then
  echo "TODO: install/build COLMAP 4.x with CUDA support."
  exit 1
fi
colmap --version || true

# ── 6. Application files ──────────────────────────────────────────────────────
sudo -u "${WORKER_USER}" mkdir -p "${PROJECT_DIR}"
# The bake workflow overwrites these same paths on every incremental bake —
# keep this list in sync with bake-worker-ami.yml's file-copy step.
for f in worker.py convert.py imds_extract.py aws_config.py log_envelope.py; do
  if [ -f "./${f}" ]; then
    sudo -u "${WORKER_USER}" cp "./${f}" "${PROJECT_DIR}/${f}"
  fi
done

# ── 7. systemd unit ────────────────────────────────────────────────────────────
sudo cp ./gaussian-worker.service /etc/systemd/system/gaussian-worker.service
sudo systemctl daemon-reload
sudo systemctl enable gaussian-worker.service

echo "== provision.sh: done. Smoke-test with: =="
echo "   sudo systemctl start gaussian-worker.service"
echo "   systemctl is-active gaussian-worker.service"
echo "   journalctl -u gaussian-worker.service -n 50 --no-pager"

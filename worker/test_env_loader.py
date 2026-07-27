import os
import tempfile
import unittest
from pathlib import Path

from env_loader import load_env_file


class EnvLoaderTests(unittest.TestCase):
    def test_load_env_file_sets_variables(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / "worker.env"
            env_path.write_text("SQS_QUEUE_URL=https://example.test/queue\nDLQURL=https://example.test/dlq\n", encoding="utf-8")

            os.environ.pop("SQS_QUEUE_URL", None)
            os.environ.pop("DLQURL", None)

            loaded = load_env_file(str(env_path))

            self.assertTrue(loaded)
            self.assertEqual(os.environ["SQS_QUEUE_URL"], "https://example.test/queue")
            self.assertEqual(os.environ["DLQURL"], "https://example.test/dlq")


if __name__ == "__main__":
    unittest.main()

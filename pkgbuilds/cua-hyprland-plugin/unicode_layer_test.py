#!/usr/bin/env python3
"""Keep the original Omarchy layer immutable and reject Unicode-layer tampering."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import downstream
import unicode_layer


class UnicodeLayerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / "base"
        self.base.mkdir()
        (self.base / "input.cpp").write_text("remaps\n")
        self.parent = self.root / "parent.json"
        self.parent.write_text(json.dumps({"files": downstream.inventory(self.base)}))
        self.patch = self.root / "unicode.patch"
        self.patch.write_text("--- a/input.cpp\n+++ b/input.cpp\n@@ -1 +1 @@\n-remaps\n+remaps and Unicode\n")
        self.source = self.root / "patched"
        self.manifest = {"schema": 1, "base_manifest_sha256": downstream.digest(self.parent),
                         "patch_sha256": downstream.digest(self.patch),
                         "files": {"input.cpp": hashlib.sha256(b"remaps and Unicode\n").hexdigest()}}

    def verify(self):
        unicode_layer.verify_inputs(self.base, self.patch, self.parent, self.manifest)

    def test_real_patch_preserves_parent(self):
        self.verify()
        downstream.prepare(self.base, self.source, self.patch, self.manifest)
        self.verify()
        self.assertEqual((self.base / "input.cpp").read_text(), "remaps\n")
        downstream.verify_tree(self.source, self.manifest)

    def test_base_content_and_manifest_tampering_refuse(self):
        (self.base / "input.cpp").write_text("different\n")
        with self.assertRaisesRegex(ValueError, "inventory/checksum"):
            self.verify()
        self.parent.write_text("{}")
        with self.assertRaisesRegex(ValueError, "base manifest"):
            self.verify()

    def test_patch_tampering_and_bad_paths_refuse(self):
        self.patch.write_text(self.patch.read_text() + "tamper\n")
        with self.assertRaisesRegex(ValueError, "patch checksum"):
            self.verify()
        self.manifest["patch_sha256"] = downstream.digest(self.patch)
        self.manifest["files"] = {"../escape": "bad"}
        with self.assertRaisesRegex(ValueError, "invalid Unicode layer path"):
            self.verify()

    def test_source_tampering_extras_and_symlinks_refuse(self):
        downstream.prepare(self.base, self.source, self.patch, self.manifest)
        file = self.source / "input.cpp"
        file.write_text("different\n")
        with self.assertRaisesRegex(ValueError, "inventory/checksum"):
            downstream.verify_tree(self.source, self.manifest)
        file.unlink()
        file.symlink_to(self.base / "input.cpp")
        with self.assertRaisesRegex(ValueError, "nonregular"):
            downstream.verify_tree(self.source, self.manifest)


if __name__ == "__main__":
    unittest.main()

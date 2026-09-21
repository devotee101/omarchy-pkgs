#!/usr/bin/env python3
"""Verify a local Unicode layer without modifying the pinned Omarchy baseline."""
import argparse
import importlib.util
import json
from pathlib import Path, PurePosixPath
import subprocess

import downstream


def verify_inputs(base, patch, base_manifest_path, manifest):
    downstream.require(manifest["schema"] == 1, "unsupported Unicode layer schema")
    downstream.require(downstream.digest(base_manifest_path) == manifest["base_manifest_sha256"],
                       "Unicode layer base manifest checksum mismatch")
    parent = json.loads(base_manifest_path.read_bytes())
    downstream.verify_tree(base, parent)
    downstream.require(patch.is_file() and not patch.is_symlink() and
                       downstream.digest(patch) == manifest["patch_sha256"], "Unicode patch checksum mismatch")
    downstream.require(manifest["files"], "empty Unicode layer inventory")
    for name in manifest["files"]:
        path = PurePosixPath(name)
        downstream.require(name and not path.is_absolute() and path.as_posix() == name and
                           ".." not in path.parts and "\\" not in name, "invalid Unicode layer path")
    return parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "check", "build"))
    for name in ("pristine", "base", "source", "patch", "manifest", "base-manifest", "kit", "archive", "cxx"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--kit-sha256", required=True)
    parser.add_argument("--build", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        # PKGBUILD pins both helpers and all manifests before executing either.
        spec = importlib.util.spec_from_file_location("upstream_profile", args.kit / "profile_verify.py")
        upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(upstream)
        profile, kit = upstream.verify_kit(args.kit, args.kit_sha256)
        base_source = upstream.verify_archive(args.archive, profile)
        downstream.require(upstream.verify_source(args.pristine, profile) == base_source,
                           "upstream source identity mismatch")
        manifest = upstream.read_json(args.manifest.read_bytes())
        parent = verify_inputs(args.base, args.patch, args.base_manifest, manifest)
        if args.mode == "prepare":
            downstream.prepare(args.base, args.source, args.patch, manifest)
        else:
            downstream.verify_tree(args.source, manifest)
        if args.mode == "build":
            downstream.require(args.build is not None and args.output is not None, "build evidence requires output")
            native = upstream.verify_native(args.cxx, profile)
            native["module_sha256"] = upstream.verify_build(args.build, args.source, args.cxx, profile)
            native["module_runtime_sha256"] = profile["runtime"]["sha256"]
            args.output.write_bytes(upstream.json_bytes(dict(native, source=base_source,
                profile=profile, kit=kit, downstream=parent, unicode_layer=manifest,
                local_package_release=manifest["local_package_release"])))
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"error: {error}\n")


if __name__ == "__main__":
    main()

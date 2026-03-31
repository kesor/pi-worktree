{
  pkgs,
  version ? "0.1.0",
}:
let
  src = ./.;
in
pkgs.stdenv.mkDerivation {
  pname = "pi-worktree";
  inherit version src;

  buildPhase = ''
    # Check if dist exists, if not we can't build in sandbox
    if [ ! -d "dist" ]; then
      echo "ERROR: dist/ folder not found. Run 'npm run build' first."
      exit 1
    fi
    echo "dist/ found, packaging..."
  '';

  installPhase = ''
    mkdir -p $out/lib/node_modules/pi-worktree
    cp -r dist README.md LICENSE package.json $out/lib/node_modules/pi-worktree/
  '';

  meta = with pkgs.lib; {
    description = "Git worktree sandboxes for safe experimentation";
    homepage = "https://github.com/kesor/pi-worktree";
    license = licenses.mit;
    platforms = platforms.all;
  };
}

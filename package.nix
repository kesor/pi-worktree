{
  pkgs,
  version ? "0.1.0",
  hash ? null,
  npmDepsHash ? null,
  src ? null,
}:
let
  srcFinal =
    if src != null then
      src
    else if hash != null then
      pkgs.fetchFromGitHub {
        owner = "kesor";
        repo = "pi-worktree";
        tag = "v${version}";
        inherit hash;
      }
    else
      ./.;
in
pkgs.buildNpmPackage {
  pname = "pi-worktree";
  inherit srcFinal version npmDepsHash;
  npmDeps = pkgs.fetchNpmDeps {
    inherit srcFinal;
    hash = npmDepsHash;
  };

  # Build TypeScript
  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/node_modules/pi-worktree
    cp -r dist README.md LICENSE package.json $out/lib/node_modules/pi-worktree/
    runHook postInstall
  '';
}

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
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/node_modules
    cp -r . $out/lib/node_modules/pi-worktree
    runHook postInstall
  '';
}

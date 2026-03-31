{
  pkgs,
  version ? "0.1.0",
  hash ? null,
  npmDepsHash ? null,
}:
let
  srcArg =
    if hash != null then
      pkgs.fetchFromGitHub {
        owner = "kesor";
        repo = "pi-worktree";
        rev = "v${version}";
        inherit hash;
      }
    else
      ./.;

  npmDepsArg = if npmDepsHash != null then
    pkgs.fetchNpmDeps {
      src = srcArg;
      hash = npmDepsHash;
    }
  else
    null;
in
pkgs.buildNpmPackage {
  pname = "pi-worktree";
  inherit srcArg version;

  src = srcArg;
  npmDeps = npmDepsArg;

  buildInputs = [ pkgs.nodejs_22 ];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/node_modules
    cp -r . $out/lib/node_modules/pi-worktree
    runHook postInstall
  '';
}

{
  description = "Pi extension: Git worktree sandboxes for safe experimentation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ] (
          system: f system
        );
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          version = "0.1.0";
          hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
          npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        in
        {
          default = self.packages.${system}.package;
          package = pkgs.callPackage ./package.nix {
            inherit version hash npmDepsHash;
          };
          devShells.default = pkgs.mkShellNoCC {
            packages = [
              pkgs.nodejs_22
              pkgs.nodePackages.typescript
              pkgs.nodePackages.pnpm
            ];
            shellHook = ''echo "🌳 pi-worktree dev shell" '';
          };
        }
      );
    };
}

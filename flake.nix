{
  description = "Pi extension: Git worktree sandboxes for safe experimentation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
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
        in
        {
          default = self.packages.${system}.package;
          package = pkgs.callPackage ./package.nix { };
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

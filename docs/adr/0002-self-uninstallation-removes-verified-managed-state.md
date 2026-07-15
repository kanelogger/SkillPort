# Self-uninstallation removes managed state

`sklp uninstall` is a confirmation-based lifecycle command for macOS, Linux, and Windows. After the user enters `y`, it removes managed Agent entries recorded by Hub state, the Hub and its managed Skills, the Hub locator, and the npm-global `skill-port-cli` package. It does not scan the filesystem; Hub-external linked Skill sources and the source checkout remain untouched.

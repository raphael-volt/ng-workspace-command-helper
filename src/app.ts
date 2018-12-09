import * as commander from 'commander'
import { readJsonSync } from 'fs-extra'
import { resolve } from 'path'
import { LibraryController } from "./core/library-controller";
import { ThemeColors, log } from "./core/log";

export class App {

    public initialize() {

        const pkg = readJsonSync(resolve(__dirname, "..", "package.json"))

        commander
            .version(pkg.version)
            .description('angular/cli helper.')


        commander.command("link [library]")
            .description("Link one or all libraries.")
            .action(this.link)
            .option('-t --type <type>', 'Link type (source|dist|s|d)', /^(source|dist|s|d)$/i)
            .option('-a --all [all]', 'Build all libraries')

        commander.command("new [library]")
            .description("Create an angular library.")
            .action(this.createLib)

        commander.command("rm [library]")
            .description("Delete an angular library.")
            .action(this.deleteLib)

        commander.command("linksrc [library]")
            .description("Update tsconfig.json to link library to his source dircetory.")
            .action(this.linkSrc)

        commander.command("linkdest [library]")
            .description("Update tsconfig.json to link library to his dest dircetory.")
            .action(this.linkDist)

        commander.command("dep [target] [value]")
            .description("Add value to target peer dependencies.")
            .action(this.addDependency)

        commander.command("build")
            .description("Build all libraries.")
            .action(this.build)


        commander.parse(process.argv)
    }

    private link = (...args) => {
        const n: string = args[0]
        const t: string | boolean = args[1].type
        const a: boolean = args[1].all
        if (a && n != undefined) {
            log("Argument error: library name provided with --all option", ThemeColors.error)
            process.exit(1)
        }
        if (!a && n == undefined) {
            log("Argument error: missing library name", ThemeColors.error)
            process.exit(1)
        }
        if (typeof t == "boolean" || ["s", "d", "source", "dist"].indexOf(t) == -1) {
            log("Argument error: invalide type (source or s, dist or d)", ThemeColors.error)
            process.exit(1)
        }
        const linkSource: boolean = (t == "s" || t == "source")
        if (!a) {
            if (linkSource)
                return this.linkSrc(n)
            return this.linkDist(n)
        }
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.linkAll(linkSource ? "source":"dist")
                log(`Libraries linked to ${linkSource ? "source":"dist"}`, ThemeColors.info)
            },
            this.exitError
        )
    }

    private linkDist = (name) => {
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.linkDist(name).subscribe(
                    success => {
                        log("Library link changed to dist", ThemeColors.info)
                        this.exit()
                    },
                    this.exitError
                )
            },
            this.exitError
        )
    }
    private build = () => {
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.buildAll().subscribe(
                    lib => {
                        log(lib.root + " build complete")
                    },
                    this.exit
                )
            },
            this.exit
        )
    }
    private linkSrc = (name) => {
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.linkSource(name).subscribe(
                    success => {
                        log("Library link changed to source", ThemeColors.info)
                        this.exit()
                    },
                    this.exitError
                )
            },
            this.exitError
        )
    }

    private deleteLib = (name: string) => {
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.deleteLib(name).subscribe(
                    success => {
                        log("Library deleted", ThemeColors.info)
                        this.exit()
                    },
                    this.exitError
                )
            },
            this.exitError
        )
    }

    private exitError = (err) => {
        log(err, ThemeColors.error)
        this.exit(false)
    }

    private createLib = (name: string) => {
        let lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.create(name)
                    .subscribe(
                        success => {
                            log("Library configuration updated", ThemeColors.info)
                            this.exit()
                        },
                        this.exitError
                    )
            },
            this.exitError
        )
    }

    private addDependency = (target: string, value: string) => {
        let lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.addPeerDependency(target, value)
                    .subscribe(
                        success => {
                            log("Peer dependecy added", ThemeColors.info)
                            this.exit()
                        },
                        this.exitError
                    )
            },
            this.exitError
        )
    }

    private exit = (success: boolean = true) => {
        process.exit(success ? 0 : 1)
    }
}


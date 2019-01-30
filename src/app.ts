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


        commander.command("link [library]")
            .description("Link one or all libraries.")
            .action(this.link)
            .option('-s --source', 'link to source')
            .option('-d --dest', 'link to dist')
            .option('-a --all', 'on all library projects defined in the angular.json file.')
        commander.command("ls [library]")
            .description("Link to source for one or all libraries.")
            .action(this.linkSourceAlias)
            .option('-a --all', 'on all library projects defined in the angular.json file.')
        commander.command("ld [library]")
            .description("Link to dist for one or all libraries.")
            .action(this.linkDistAlias)
            .option('-s --source', 'link to source')
            .option('-d --dest', 'link to dist')
            .option('-a --all', 'on all library projects defined in the angular.json file.')

        commander.command('sub <library> <name>')
            .action(this.subPackage)
        commander.command("new [library]")
            .description("Create an angular library.")
            .action(this.createLib)

        commander.command("rm [library]")
            .description("Delete an angular library.")
            .action(this.deleteLib)

        commander.command("dep [target] [value]")
            .description("Add value to target peer dependencies.")
            .action(this.addDependency)

        commander.command("build [library]")
            .description("Build one or all libraries.")
            .action(this.build)

        commander.parse(process.argv)
    }

    private linkSourceAlias = (...args) => {
        //console.log(args[0], args[1])
        this.link(args[0], { source: true, all: args[0] == undefined })
    }
    private linkDistAlias = (...args) => {
        this.link(args[0], { dest: true, all: args[0] == undefined })
    }

    private link = (...args) => {
        const n: string = args[0]
        const d: boolean = args[1].dest === true
        const s: boolean = args[1].source === true
        const a: boolean = args[1].all === true

        if (d && s) {
            this.exitError("Only one option must be set (--dest or --source)")
        }
        if (n !== undefined && a) {
            this.exitError("Only one option must be set (library or --all)")
        }
        const lg: LibraryController = new LibraryController()
        const mode = s ? "source" : "dest"
        lg.check().subscribe(
            success => {
                if (a)
                    lg.linkAll(mode)
                else
                    lg.link(n, mode)
                log(`Libraries linked to ${mode}`, ThemeColors.info)
            },
            this.exitError
        )
    }

    private build = (name: string, commands: commander.Command) => {
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                if (lg.hasLibrary(name)) {
                    lg.buildLibrary(name)
                        .subscribe(
                            this.exit,
                            this.exitError
                        )
                }
                else {

                    lg.buildAll().subscribe(
                        lib => {
                            log(lib.root + " build complete")
                        },
                        this.exitError
                    )
                }
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

    private subPackage = (libName: string, subName: string) => {
        let lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.createScoped(libName, subName)
            },
            this.exitError)
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


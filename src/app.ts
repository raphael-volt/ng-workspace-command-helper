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
            .description('angular/cli libraries management helpers. Should be used inside an angular workspace (angular/cli version > 7.1.1).')

        commander
            .command("new <library>", "Create a library and set link mode to source.")
            .action(this.createLib)

        commander
            .command("dep [target] [value]", "Add dependency.")
            .action(this.addDependency)
        //.on("--help", ()=>console.log("Add value to target peer dependencies (change the ng-package.json file)."))

        commander
            .command("build", "Build all libraries.")
            .action(this.build)

        commander
            .command("link [library]", "Change library link mode.")
            .option('-s --source', 'link to source')
            .option('-d --dest', 'link to dest')
            .option('-a --all', 'on all library projects defined in the angular.json file.')
            .action(this.link)
        //.on('--help', ()=>console.log("Switch link mode of one or all libraries to their source or dest directory (change the tsconfig.json file).\nThe library name to link (required if the --all option is not set)."))

        commander
            .parse(process.argv)

    }

    private link = (...args) => {
        const n: string = args[0]
        const d: boolean = args[1].d === true
        const s: boolean = args[1].s === true
        const a: boolean = args[1].a === true
        if (d && s) {
            this.exitError("Only one option must be set (--dest or --source)")
        }
        if (n !== undefined && a) {
            this.exitError("Only one option must be set (library or --all)")
        }
        const lg: LibraryController = new LibraryController()
        lg.check().subscribe(
            success => {
                lg.linkAll(s ? "source" : "dest")
                log(`Libraries linked to ${s ? "source" : "dist"}`, ThemeColors.info)
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


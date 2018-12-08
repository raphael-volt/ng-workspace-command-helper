import * as commander from 'commander'
import * as cp from 'child_process'
import { Observable, Observer } from "rxjs";
import * as colors from 'colors'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as rimraf from "rimraf";

enum ThemeColors { none, silly, input, verbose, prompt, info, data, help, warn, debug, error, bold }

export class App {

    public initialize() {
        commander
            .version('0.0.1')
            .description('angular/cli helper.')

        commander.command("new [library]")
            .description("Create an angular library.")
            .action(this.createLib)
        commander.command("rm [library]")
            .description("Delete an angular library.")
            .action(this.deleteLib)

        commander.parse(process.argv)
    }

    private linkDist = (name) => {
        const lg: LibGenerator = new LibGenerator()
        lg.check().subscribe(
            success => {
                lg.linkkDist(name).subscribe(
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

    private deleteLib = (name: string) => {
        const lg: LibGenerator = new LibGenerator()
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

    private exitError(err) {
        log(err, ThemeColors.error)
        this.exit(false)
    }

    private createLib = (name: string) => {
        let lg: LibGenerator = new LibGenerator()
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

    private exit(success: boolean = true) {
        process.exit(success ? 0 : 1)
    }
}

colors.setTheme({
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'grey',
    info: 'green',
    data: 'grey',
    help: 'cyan',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
})
interface ITSConfig {
    compilerOptions: {
        paths: {
            [name: string]: string[]
        }
    }
}
const log = (message: string, color: ThemeColors = ThemeColors.none) => {
    console.log(logMessage(message, color))
}

const logMessage = (message: string, color: ThemeColors): string => {
    if (color != ThemeColors.none) {
        const prop: string = ThemeColors[color]
        const fn: (message: string) => string = colors[prop]
        return fn(message)
    }
    return message
}

const exec = (command: string, logCommand: boolean = false, logOut: boolean = false): Observable<string> => {
    return Observable.create((observer: Observer<string>) => {
        if (logCommand)
            log(logMessage(`> ${command}`, ThemeColors.debug), ThemeColors.bold)
        let child: cp.ChildProcess = cp.exec(command, (err: Error, strOut: string, stdErr: string) => {
            if (err) {
                log(err.name + " " + err.message, ThemeColors.bold)
                return observer.error(err)
            }
            if (logOut)
                log(strOut, ThemeColors.prompt)
            observer.next(strOut)
            child.stdin.end()
            observer.complete()
        })
    })
}

const findRecurse = (filename: string, dir: string): string => {
    let fn = null
    const exist = (fn) => {
        return fs.existsSync(fn)
    }
    const check = () => {
        if (!exist(dir)) {
            fn = null
            return
        }
        fn = path.resolve(dir, filename)
        if (exist(fn)) {
            return
        }
        const prev = dir
        dir = path.resolve(dir, '..')
        if (prev == dir) {
            fn = null
            return
        }
        check()
    }
    check()
    return fn
}

const versionGTOE = (v: string, r0: number, r1: number, r2: number) => {
    let l: number[] = v.split(".").map(s => +s)
    if (l[0] < r0)
        return false
    else {
        if (l[0] == r0) {
            if (l[1] == r1)
                return l[2] >= r2
            return true
        }
        return true
    }
}

const JSON_CONF = {
    spaces: 2
}

const NG_JSON = "angular.json"
const TS_JSON = "tsconfig.json"

export class LibGenerator {

    private cwd: string
    private ngPath: string
    private ngAppDir: string
    private checked: boolean = false

    private ngJson: any
    private tsJson: ITSConfig

    check(): Observable<boolean> {
        this.cwd = process.cwd()
        return Observable.create((o: Observer<Boolean>) => {
            this.ngPath = findRecurse('angular.json', this.cwd)

            if (this.ngPath) {
                this.ngAppDir = path.dirname(this.ngPath)
                const fn = path.join(this.ngAppDir, "node_modules", "@angular", "cli", "package.json")
                if (!fs.existsSync(fn)) {
                    return o.error("can't get @angular/cli version")
                }
                const pkg = fs.readJSONSync(fn)
                let version: string = pkg.version
                if (!versionGTOE(version, 7, 1, 2)) {
                    return o.error("angular/cli version < 7.1.2")
                }
                this.ngJson = fs.readJSONSync(NG_JSON)
                this.tsJson = fs.readJsonSync(TS_JSON)
                this.checked = true
                o.next(true)
                o.complete()
            }
            else {
                o.error("Angular project not found")
            }
        })
    }

    private libraryExists(libName): boolean {
        return this.ngJson.projects[libName] !== undefined
    }

    deleteLib(libName): Observable<boolean> {
        return Observable.create((o: Observer<boolean>) => {
            const canEdit = this.canEditLib(libName)
            if (typeof canEdit == "string")
                return o.error(canEdit)

            this.cdProject()
            let j = this.ngJson
            const lib = j.projects[libName]
            const libRoot = lib.root
            delete (j.projects[libName])
            // update angular.json
            fs.writeJsonSync(NG_JSON, j, JSON_CONF)
            j = this.tsJson
            // delete tsconfig library path
            delete (j.compilerOptions.paths[libName])
            delete (j.compilerOptions.paths[libName + "/*"])
            // update tsconfig.json
            fs.writeJSONSync(TS_JSON, j, JSON_CONF)
            // delete library directory
            rimraf(libRoot, error => {
                this.restoreCwd()
                if (error)
                    return o.error(error)
                o.next(true)
                o.complete()
            })
        })
    }

    private cdProject() {
        this.cwd = process.cwd()
        process.chdir(this.ngAppDir)
    }
    private restoreCwd() {
        process.chdir(this.cwd)
    }

    create(libName): Observable<boolean> {
        return Observable.create((o: Observer<boolean>) => {
            if (!this.checked)
                return o.error("Missing angular context")
            this.cdProject()
            exec("ng g library " + libName).subscribe(
                output => {
                    console.log(output)
                    // refresh angular.json
                    this.ngJson = fs.readJSONSync(NG_JSON)
                    // link tsconfig path to library entry file
                    this._linkSource(libName)
                    this.restoreCwd()
                    o.next(true)
                    o.complete()
                }
            ),
                err => {
                    o.error(err)
                }
        })
    }

    private getNgPackageJSON(libName) {
        const lib = this.ngJson.projects[libName]
        return fs.readJSONSync(lib.architect.build.options.project)
    }

    private canEditLib(libName: string): string | boolean {
        if (!this.checked)
            return "Missing angular context"
        if (!this.libraryExists(libName))
            return "Missing library"
        return true
    }

    linkkDist(libName: string) {
        return Observable.create((o: Observer<boolean>) => {
            const canEdit = this.canEditLib(libName)
            if (typeof canEdit == "string")
                return o.error(canEdit)

            this.cdProject()
            this._linkDist(libName)
            this.restoreCwd()

            o.next(true)
            o.complete()
        })
    }

    private _linkDist(libName: string) {
        const libPKG = this.getNgPackageJSON(libName)
        const lib = this.ngJson.projects[libName]
        const dest = path.normalize(path.join(lib.root, libPKG.dest))
        const tsj = this.tsJson
        tsj.compilerOptions.paths[libName] = [dest]
        tsj.compilerOptions.paths[libName + "/*"] = [dest + "/*"]
        fs.writeJSONSync(TS_JSON, tsj, JSON_CONF)
    }

    
    linkSource(libName: string) {
        return Observable.create((o: Observer<boolean>) => {
            const canEdit = this.canEditLib(libName)
            if (typeof canEdit == "string")
            return o.error(canEdit)
            
            this.cdProject()
            this._linkSource(libName)
            this.restoreCwd()
            
            o.next(true)
            o.complete()
        })
    }
    
    private _linkSource(libName: string) {
        const entryFile = this.getEntryFile(libName)
        let tsj = this.tsJson
        tsj.compilerOptions.paths[libName] = [entryFile]
        delete (tsj.compilerOptions.paths[libName + "/*"])
        fs.writeJSONSync(TS_JSON, tsj, JSON_CONF)
    }
    
    private getEntryFile(libName: string): string {
        const j = this.ngJson
        const lib = j.projects[libName]
        const libPKG = this.getNgPackageJSON(libName)
        let entryFile = lib.root + "/" + libPKG.lib.entryFile
        const ex = path.extname(entryFile)
        return entryFile.slice(0, entryFile.lastIndexOf(ex))
    }
}
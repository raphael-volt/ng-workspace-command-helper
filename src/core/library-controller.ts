import { Observable, Observer } from "rxjs";
import * as fs from 'fs-extra'
import * as path from 'path'
import * as rimraf from "rimraf";
import { exec } from "./exec";
import { satisfies } from "semver";
import { DependenciesResolver } from "./dependency-resolver";
import { ThemeColors, log, logMessage } from "./log";
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

const JSON_CONF = {
    spaces: 2
}

const saveJson = (filename: string, value: any) => {
    fs.writeJSONSync(filename, value, JSON_CONF)
}

const NG_JSON = "angular.json"
const TS_JSON = "tsconfig.json"
const NG_PACKAGE_JSON = "ng-package.json"
const PACKAGE_JSON = "package.json"
const TYPE_LIBRARY = "library"
interface ITSConfig {
    compilerOptions: {
        paths: {
            [name: string]: string[]
        }
    }
}

interface INGPackage {
    dest: string
    lib: {
        entryFile: string
    }
}
interface INodePackage {
    name?: string
    version?: string
    peerDependencies?: {
        [name: string]: string
    }
    dependencies?: {
        [name: string]: string
    }
    devDependencies?: {
        [name: string]: string
    }
}

export interface IAngularProject {
    root: string
    sourceRoot: string
    projectType: string
    prefix: string
    architect: {
        build: {
            builder: string
            options: {
                tsConfig: string
                project: string
            }
        }
    }
}
interface IAngularProjectCollection {
    [name: string]: IAngularProject
}
interface IAngularConfig {
    version: number
    newProjectRoot: string
    projects: IAngularProjectCollection
    defaultProject: string

}
export type LinkMode = "source" | "dest"
export class LibraryController {

    private cwd: string
    private ngPath: string
    private ngAppDir: string
    private checked: boolean = false

    private ngConfig: IAngularConfig
    private tsConfig: ITSConfig

    check(): Observable<boolean> {
        this.cwd = process.cwd()
        return Observable.create((o: Observer<Boolean>) => {
            this.ngPath = findRecurse('angular.json', this.cwd)

            if (this.ngPath) {
                this.ngAppDir = path.dirname(this.ngPath)
                const fn = path.join(this.ngAppDir, "node_modules", "@angular", "cli", PACKAGE_JSON)
                if (!fs.existsSync(fn)) {
                    return o.error("can't get @angular/cli version")
                }
                const pkg: INodePackage = fs.readJSONSync(fn)
                let version: string = pkg.version
                if (!satisfies(version, ">=7.1.2")) {
                    return o.error("angular/cli version < 7.1.2")
                }
                this.ngConfig = fs.readJSONSync(NG_JSON)
                this.tsConfig = fs.readJsonSync(TS_JSON)
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
        let lib = this.ngConfig.projects[libName]
        return (lib !== undefined && lib.projectType == TYPE_LIBRARY)
    }

    deleteLib(libName): Observable<boolean> {
        return Observable.create((o: Observer<boolean>) => {
            const canEdit = this.canEditLib(libName)
            if (typeof canEdit == "string")
                return o.error(canEdit)

            this.cdProject()
            let ng = this.ngConfig
            const lib = ng.projects[libName]
            const libRoot = lib.root
            delete (ng.projects[libName])
            // update angular.json
            saveJson(NG_JSON, ng)
            let tj = this.tsConfig
            // delete tsconfig library path
            delete (tj.compilerOptions.paths[libName])
            delete (tj.compilerOptions.paths[libName + "/*"])
            // update tsconfig.json
            saveJson(TS_JSON, tj)
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
                    this.ngConfig = fs.readJSONSync(NG_JSON)
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

    private getNgPackageJSON(libName): INGPackage {
        const lib = this.ngConfig.projects[libName]
        return fs.readJSONSync(lib.architect.build.options.project)
    }
    private getLibPackageJSON(libName): INodePackage {
        const lib = this.ngConfig.projects[libName]
        return fs.readJSONSync(path.join(lib.root, PACKAGE_JSON))
    }

    private saveLibPackageJSON(libName, pkg: INodePackage) {
        const lib = this.ngConfig.projects[libName]
        saveJson(path.join(lib.root, PACKAGE_JSON), pkg)
    }

    private canEditLib(libName: string): string | boolean {
        if (!this.checked)
            return "Missing angular context"
        if (!this.libraryExists(libName))
            return "Missing library"
        return true
    }

    private _linkDist(libName: string, save: boolean = true) {
        const libPKG = this.getNgPackageJSON(libName)
        const lib = this.ngConfig.projects[libName]
        const dest = path.normalize(path.join(lib.root, libPKG.dest))
        const tsj = this.tsConfig
        tsj.compilerOptions.paths[libName] = [dest]
        tsj.compilerOptions.paths[libName + "/*"] = [dest + "/*"]
        if (save)
            saveJson(TS_JSON, tsj)
    }

    private _linkSource(libName: string, save: boolean = true) {
        const entryFile = this.getEntryFile(libName)
        let tsj = this.tsConfig
        tsj.compilerOptions.paths[libName] = [entryFile]
        delete (tsj.compilerOptions.paths[libName + "/*"])
        if (save)
            saveJson(TS_JSON, tsj)
    }

    /**
     * 
     * @param name 
     * @param type 
     * @throws not checked
     */
    link(name: string, type: LinkMode) {
        if (!this.checked)
            throw new Error("Missing angular context")

        this.cdProject()
        if (type == "dest")
            this._linkDist(name)
        else 
            this._linkSource(name)
        this.restoreCwd()
    }
    /**
     * 
     * @param type 
     * @throws not checked
     */
    linkAll(type: LinkMode) {
        if (!this.checked)
            throw new Error("Missing angular context")
        let libs = this.getLibraries()
        const fn = type == "source" ? this._linkSource : this._linkDist
        for (const n in libs) {
            fn.apply(this, [n, false])
        }
        saveJson(TS_JSON, this.tsConfig)
    }

    public addPeerDependency(target: string, value: string) {
        return Observable.create((o: Observer<boolean>) => {

            if (!this.libraryExists(target) || !this.libraryExists(value))
                return o.error("unknow library")

            this.cdProject()

            const targetPKG = this.getLibPackageJSON(target)
            const depPKG = this.getLibPackageJSON(value)
            targetPKG.peerDependencies[value] = "^" + depPKG.version
            this.saveLibPackageJSON(target, targetPKG)

            this.restoreCwd()
            o.next(true)
            o.complete()
        })
    }

    private getLibraries(): IAngularProjectCollection {
        const res: IAngularProjectCollection = {}
        const libs = this.ngConfig.projects
        for (const n in libs) {
            if (libs[n].projectType == TYPE_LIBRARY)
                res[n] = libs[n]
        }
        return res
    }

    public buildAll(): Observable<IAngularProject> {
        return Observable.create((o: Observer<IAngularProject>) => {
            const res: DependenciesResolver = new DependenciesResolver()
            const libs = this.getLibraries()
            let libNames: string[]
            for (const n in libs) {
                res.add(n)
            }
            for (const n in libs) {
                const pkg = this.getLibPackageJSON(n)
                for (const d in pkg.peerDependencies) {
                    if (libs[d] !== undefined)
                        res.setDependency(n, d)
                }
            }
            try {
                libNames = res.sort()
            } catch (error) {
                return o.error(error)
            }

            const next = () => {
                if (!libNames.length) {
                    return o.complete()
                }
                const name = libNames.shift()
                exec("ng build " + name, true, false).subscribe(
                    output => {
                        log(logMessage("✓", ThemeColors.info) + " Built " + name)
                        o.next(libs[name])
                        next()
                    },
                    o.error
                )
            }
            next()
        })
    }

    private getEntryFile(libName: string): string {
        const j = this.ngConfig
        const lib = j.projects[libName]
        const libPKG = this.getNgPackageJSON(libName)
        let entryFile = lib.root + "/" + libPKG.lib.entryFile
        const ex = path.extname(entryFile)
        return entryFile.slice(0, entryFile.lastIndexOf(ex))
    }
}
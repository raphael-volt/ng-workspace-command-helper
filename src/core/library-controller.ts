import { Observable, Observer } from "rxjs";
import { map, catchError } from "rxjs/operators";
import * as fs from 'fs-extra'
import * as path from 'path'
import * as rimraf from "rimraf";
import * as jsonStringify from 'json-stable-stringify'
import * as find from "find";
import { exec } from "./exec";
import { DependenciesResolver } from "./dependency-resolver";
import { ThemeColors, log, logMessage } from "./log";
const findInParentRecurse = (filename: string, dir: string): string => {
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
const keySort = (a, b) => {
    return a.key < b.key ? -1 : 1;
}
const saveJson = (filename: string, value: any) => {
    fs.writeJSONSync(filename, JSON.parse(jsonStringify(value, keySort)), JSON_CONF)
}

const NG_JSON = "angular.json"
const TS_JSON = "tsconfig.json"
const PUBLIC_API_TS = "public_api.ts"
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
    dest?: string
    lib: {
        entryFile: string
    }
}

interface INGSubPackage {
    ngPackage: INGPackage
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
            this.ngPath = findInParentRecurse('angular.json', this.cwd)

            if (this.ngPath) {
                this.ngAppDir = path.dirname(this.ngPath)
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

    hasLibrary(name: string): boolean {
        return (this.checked && this.libraryExists(name))
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

    createScoped(libName: string, scope: string) {
        const check = this.canEditLib(libName)
        if (check !== true)
            throw new Error(check as string)
        this.cdProject()
        const lib = this.ngConfig.projects[libName]
        const root = lib.root
        const scopeDir = path.join(root, scope)
        fs.mkdirpSync(path.join(scopeDir, 'src'))
        process.chdir(scopeDir)
        const main: string = `src/${scope}.ts`
        const apiPath: string = 'src/' + PUBLIC_API_TS
        fs.writeFileSync(apiPath, `export * from './${scope}'`)
        fs.writeFileSync(main, `export const ${scope.toUpperCase()} = "${scope}"`)
        const pkg: INGSubPackage = {
            ngPackage: {
                lib: {
                    entryFile: apiPath
                }
            }
        }
        saveJson(PACKAGE_JSON, pkg)
        this.cdProject()
        const tsc: ITSConfig = this.tsConfig
        tsc.compilerOptions.paths[`${libName}/${scope}`] = [path.join(root, scope, apiPath)]
        saveJson(TS_JSON, tsc)

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
        process.chdir(lib.root)
        let pkgs = find.fileSync(PACKAGE_JSON, '.')
        pkgs = pkgs.filter(fn => {
            return fn != PACKAGE_JSON
        })
        if (pkgs.length){
            for(let fn of pkgs) {
                fn = path.dirname(fn)
                delete tsj.compilerOptions.paths[`${libName}/${fn}`]
            }
        }
        this.cdProject()
        tsj.compilerOptions.paths[libName] = [dest]
        tsj.compilerOptions.paths[libName + "/*"] = [dest + "/*"]
        if (save)
            saveJson(TS_JSON, tsj)
    }

    private _linkSource(libName: string, save: boolean = true) {
        const lib = this.ngConfig.projects[libName]
        let entryFile = this.getEntryFile(libName)
        let tsj = this.tsConfig
        tsj.compilerOptions.paths[libName] = [entryFile]
        delete (tsj.compilerOptions.paths[libName + "/*"])

        process.chdir(lib.root)
        let pkgs = find.fileSync(PACKAGE_JSON, '.')
        pkgs = pkgs.filter(fn => {
            return fn != PACKAGE_JSON
        })
        if (pkgs.length){
            for(let fn of pkgs) {
                const pkg: INGPackage = fs.readJSONSync(fn)
                const name = path.dirname(fn)
                tsj.compilerOptions.paths[`${libName}/${name}`] = [path.join(lib.root, name, pkg.lib.entryFile)]
            }
        }
        this.cdProject()
        if (save)
            saveJson(TS_JSON, tsj)
    }
    private getScopedEntryFile(libName: string): string {
        const j = this.ngConfig
        const lib = j.projects[libName]
        const libPKG = this.getNgPackageJSON(libName)
        let entryFile = lib.root + "/" + libPKG.lib.entryFile
        const ex = path.extname(entryFile)
        return entryFile.slice(0, entryFile.lastIndexOf(ex))
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
                this.buildLibrary(name)
                    .subscribe(success => {
                        o.next(libs[name])
                        next()
                    },
                        o.error)
            }
            next()
        })
    }

    buildLibrary(name: string): Observable<boolean> {
        return exec("ng build " + name, true, false)
            .pipe(
                map(
                    output => {
                        log(logMessage("✓", ThemeColors.info) + " Built " + name)
                        return true
                    }
                )
            )
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
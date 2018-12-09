import * as chai from 'chai';
import { join, resolve, basename, extname, normalize } from "path";
import { LibraryController } from "../src/core/library-controller";
import * as fs from 'fs-extra'
// const semver = require('semver')
import * as SemVer from "semver";
let libGen: LibraryController
const TEST_LIB: string = "test-lib"

describe('ng-helper', () => {
    describe.skip('string', () => {
        it('should remove ext of file path', () => {
            const str = "src/public_api.ts"
            const ex = extname(str)
            chai.expect(ex).eq(".ts")
            const i = str.lastIndexOf(ex)
            const res = str.slice(0, i)
            chai.expect(res).eq("src/public_api")
        })
        it('should resolve dist', () => {
            const root = "projects/fake"
            const rel = "../../dist/fake"
            chai.expect(normalize(join(root, rel))).eq("dist/fake")
        })
    })
    describe("Build", () => {
        it("should build all libraries", done => {
            process.chdir(resolve(__dirname, "..", "tests", "sample"))
            const lc: LibraryController = new LibraryController()
            lc.check().subscribe(
                success => {
                    lc.buildAll().subscribe(
                        lib => {

                        },
                        done,
                        () => done()
                    )
                },
                done
            )
        })
    })
    describe.skip("LibGenerator", () => {
        it('should create LibGenerator', () => {
            libGen = new LibraryController()
            chai.expect(libGen).not.to.be.undefined
        })
        it('should check angular project', done => {
            process.chdir(resolve(__dirname, "..", "tests", "sample"))
            libGen.check().subscribe(
                success => done(),
                done
            )
        })
        it('should create a lib', done => {
            libGen.create(TEST_LIB)
                .subscribe(
                    success => {
                        done()
                    },
                    err => {
                        done(err)
                    }
                )
        })
        it('library should be linked to sources', () => {
            let tsc = fs.readJSONSync("tsconfig.json")
            chai.expect(tsc.compilerOptions.paths[TEST_LIB][0]).eq("projects/" + TEST_LIB + "/src/public_api")
            chai.expect(tsc.compilerOptions.paths[TEST_LIB + "/*"]).undefined
        })

        it('should link to dist', done => {
            libGen.linkDist(TEST_LIB).subscribe(
                sucsess => {
                    let tsc = fs.readJSONSync("tsconfig.json")
                    chai.expect(tsc.compilerOptions.paths[TEST_LIB][0]).eq("dist/" + TEST_LIB)
                    chai.expect(tsc.compilerOptions.paths[TEST_LIB + "/*"][0]).eq("dist/" + TEST_LIB + "/*")
                    done()
                },
                done
            )
        })

        it('should link to source', done => {
            libGen.linkSource(TEST_LIB).subscribe(
                sucsess => {
                    let tsc = fs.readJSONSync("tsconfig.json")
                    chai.expect(tsc.compilerOptions.paths[TEST_LIB][0]).eq("projects/" + TEST_LIB + "/src/public_api")
                    chai.expect(tsc.compilerOptions.paths[TEST_LIB + "/*"]).undefined
                    done()
                },
                done
            )
        })

        it('should delete a lib', done => {
            libGen.deleteLib(TEST_LIB)
                .subscribe(
                    success => done(),
                    done
                )
        })
    })
})
import { Observable, Observer } from "rxjs";
import { logMessage, log, ThemeColors } from "./log";
import * as cp from "child_process";

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

export { exec }
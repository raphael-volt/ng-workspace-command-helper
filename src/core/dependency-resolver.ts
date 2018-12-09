class Package {
  public dependencies:Package[] = []
  constructor(public name:string){

  }
}

interface PackageMap {
  [id:string]:Package;
}

export class DependenciesResolver {

  private static ROOT_SERVICE_NAME:string = '#root#';

  private services:PackageMap = {};

  constructor() {

  }

  public add(name:string):void {
    this.addAndGet(name);
  }

  private addAndGet(serviceName:string):Package {
    if (this.services[serviceName]) {
      return this.services[serviceName];
    }
    this.services[serviceName] = new Package(serviceName);
    //Add dependency to root element for sort function to work
    if (serviceName !== DependenciesResolver.ROOT_SERVICE_NAME) { //avoid circular depdency of root service
      this.setDependency(DependenciesResolver.ROOT_SERVICE_NAME, serviceName);
    }
    return this.services[serviceName];
  }

  public setDependency(serviceName:string, dependencyName:string):void {
    var service:Package = this.addAndGet(serviceName);
    var dependency:Package = this.addAndGet(dependencyName);
    service.dependencies.push(dependency);
  }

  public resolve(serviceName:string):string[] {
    var resolved:Package[] = [];
    var unresolved:Package[] = [];
    var service:Package = this.services[serviceName];
    if (!service) {
      throw new Error('DepService ' + serviceName + ' does not exist');
    }
    this.recursiveResolve(service, resolved, unresolved);
    return resolved.map((s:Package):string => s.name);
  }

  public sort():string[] {
    var deps:string[] = this.resolve(DependenciesResolver.ROOT_SERVICE_NAME);
    deps.pop(); //remove DependencyResolver.ROOT_SERVICE_NAME element
    return deps;
  }

  private recursiveResolve(service:Package, resolved:Package[], unresolved:Package[]):void {
    unresolved.push(service);
    service.dependencies.forEach((sub:Package) => {
      if (resolved.indexOf(sub) === -1) {
        if (unresolved.indexOf(sub) !== -1) {
          throw new Error('Circular reference detected: ' + service.name + ' -> ' + sub.name);
        }
        this.recursiveResolve(sub, resolved, unresolved)
      }
    });
    resolved.push(service);
    unresolved.splice(unresolved.indexOf(service), 1);
  }

}
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// import * as commander from 'commander';
// const cmd = new commander.Command();
// cmd
//   .arguments('<dir>')
//   .option('-v, --verbose', 'verbose (do nothing)')
//   .parse(process.argv);
// const inputDir = cmd.args[0] ?? '.';
// const opts = cmd.opts();

let inputDir: string | undefined = undefined;
const opts = {
  verbose: false,
  npmUpdate: false,
  npmAuditFix: false,
};
for (let i = 2; i < process.argv.length; i++) {
  const argc = process.argv[i];
  if (argc === '-h' || argc === '--help') {
    console.log(
      'Usage: tsx updatePackageJson.ts [options] <dir>\n\n' +
      'Options:\n' +
      '  -u, --npm-update     run npm update before updating\n' +
      '  -a, --npm-audit-fix  run npm audit fix before updating\n' +
      '  -v, --verbose        verbose mode\n' +
      '  -h, --help           display help for command\n'
    );
    process.exit(0);
  } else if (argc === '-u' || argc === '--npm-update') {
    opts.npmUpdate = true;
  } else if (argc === '-a' || argc === '--npm-audit-fix') {
    opts.npmAuditFix = true;
  } else if (argc === '-v' || argc === '--verbose') {
    opts.verbose = true;
  } else if (inputDir == null) {
    inputDir = argc;
  }
}
if (inputDir == null) inputDir = '.';

const packageJsonFile = path.join(inputDir, 'package.json');
const packageLockJsonFile = path.join(inputDir, 'package-lock.json');

function readJson(file: string): Record<string, any> {
  const text = fs.readFileSync(file, { encoding: 'utf8' });
  const result = JSON.parse(text);
  if (result == null || typeof result !== 'object') {
    throw new Error(`Invalid JSON file - ${file}`);
  }
  return result as Record<string, any>;
}

function writeJson(file: string, json: any): void {
  const data = JSON.stringify(json, null, 2) + '\n';
  if (file != null) {
    try {
      fs.writeFileSync(file, data);
      console.log('wrote ' + file);
    } catch (e) {
      console.error('write error: ' + file);
    }
  } else {
    console.log(data);
  }
}

class SemanticVersion {
  core: (string | number)[];
  preRelease?: (string | number)[];
  build?: (string | number)[];

  constructor(value: string) {
    const [core, preRelease, build] = SemanticVersion.parse(value);
    this.core = core ?? [];
    this.preRelease = preRelease ?? undefined;
    this.build = build ?? undefined;
  }

  toString(): string {
    let result = this.core.map((v) => `${v}`).join('.');
    if (this.preRelease != null) {
      result += '-' + this.preRelease.map((v) => `${v}`).join('.');
    }
    if (this.build != null) {
      result += '+' + this.build.map((v) => `${v}`).join('.');
    }
    return result;
  }

  private static parse(
    ver: string
  ): [(string | number)[] | null, (string | number)[] | null, (string | number)[] | null] {
    function separateByDot(s?: string | null): (string | number)[] | null {
      if (s == null) return null;
      return s.split('.').map((v) => (/^(0|[1-9]\d*)$/.test(v) ? parseInt(v, 10) : v));
    }
    let core = ver;
    let preRelease: string | null = null;
    let build: string | null = null;
    let idx = core.indexOf('+');
    if (idx >= 0) {
      build = core.slice(idx + 1);
      core = core.slice(0, idx);
    }
    idx = core.indexOf('-');
    if (idx >= 0) {
      preRelease = core.slice(idx + 1);
      core = core.slice(0, idx);
    }
    return [separateByDot(core), separateByDot(preRelease), separateByDot(build)];
  }

  static compare(
    ver1: string | SemanticVersion,
    ver2: string | SemanticVersion,
    digit?: number
  ): number {
    function cmpvals(v1: (string | number)[], v2: (string | number)[]): number {
      let i = 0;
      while (i < v1.length && i < v2.length) {
        const x1 = v1[i];
        const x2 = v2[i];
        if (typeof x1 === 'number') {
          if (typeof x2 === 'number') {
            const result = x1 - x2;
            if (result !== 0) return result;
          } else {
            return -1;
          }
        } else {
          if (typeof x2 === 'number') {
            return 1;
          } else {
            const result = x1.localeCompare(x2);
            if (result !== 0) return result;
          }
        }
        i += 1;
        if (digit != null && digit > 0 && i >= digit) return 0;
      }
      return v1.length - v2.length;
    }
    const v1 = typeof ver1 === 'string' ? new SemanticVersion(ver1) : ver1;
    const v2 = typeof ver2 === 'string' ? new SemanticVersion(ver2) : ver2;
    const result = cmpvals(v1.core, v2.core);
    if (result !== 0) return result;
    if (v1.preRelease != null) {
      if (v2.preRelease != null) {
        const result = cmpvals(v1.preRelease, v2.preRelease);
        if (result !== 0) return result;
      } else {
        return -1;
      }
    } else {
      if (v2.preRelease != null) {
        return 1;
      }
    }
    return 0;
  }
}

if (opts.npmUpdate || opts.npmAuditFix) {
  const cwd = path.resolve(inputDir);
  if (opts.npmUpdate) {
    console.log(`npm update (cwd: ${cwd})`);
    execSync('npm update', { cwd, stdio: 'inherit' });
  }
  if (opts.npmAuditFix) {
    try {
      console.log(`npm audit fix (cwd: ${cwd})`);
      execSync('npm audit fix', { cwd, stdio: 'inherit' });
    } catch {
      // npm audit fix may exit with non-zero if some issues cannot be fixed automatically
    }
  }
}

const packageJson = readJson(packageJsonFile);
const packageLockJson = readJson(packageLockJsonFile);

const updates = new Map<string, string>();

for (const tag of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, semver] of Object.entries(packageJson[tag] ?? {})) {
    if (typeof semver !== 'string') continue;
    const m = semver.match(/^([\^\~])(\d+(\.\d+(\.\d+.*|)|))$/);
    if (m != null) {
      const [prefix, version] = [m[1], m[2]];
      const obj = packageLockJson.dependencies?.[name] ?? packageLockJson.packages?.[`node_modules/${name}`];
      if (obj != null && typeof obj === 'object' && typeof obj.version === 'string') {
        const curVer = new SemanticVersion(version);
        const newVer = new SemanticVersion(obj.version);
        const cmp = SemanticVersion.compare(curVer, newVer);
        if (cmp < 0) {
          const core = Array.from(curVer.core);
          switch (prefix) {
            case '~': {
              if (typeof core[1] === 'number') core[1] += 1;
              core[2] = 0;
              break;
            }
            case '^': {
              if (core[0] === 0) {
                if (core[1] === 0) {
                  if (typeof core[2] === 'number') core[2] += 1;
                } else {
                  if (typeof core[1] === 'number') core[1] += 1;
                  core[2] = 0;
                }
              } else {
                if (typeof core[0] === 'number') core[0] += 1;
                core[1] = 0;
                core[2] = 0;
              }
              break;
            }
          }
          const maxVer = core.map((v) => `${v}`).join('.');
          const cmp2 = SemanticVersion.compare(maxVer, newVer);
          if (cmp2 > 0) {
            updates.set(name, prefix + obj.version);
          }
        }
      }
    }
  }
}

if (updates.size > 0) {
  for (const tag of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const obj = packageJson[tag] ?? {};
    const lockobj = packageLockJson['packages']?.['']?.[tag] ?? {};
    for (const [name, curVer] of Object.entries(obj)) {
      const newVer = updates.get(name);
      if (newVer != null) {
        obj[name] = newVer;
        lockobj[name] = newVer;
        console.log(`${name}: ${curVer} => ${newVer}`);
      }
    }
  }
  if (!opts.verbose) {
    writeJson(packageJsonFile, packageJson);
    writeJson(packageLockJsonFile, packageLockJson);
  }
} else {
  // console.log('no updates');
}

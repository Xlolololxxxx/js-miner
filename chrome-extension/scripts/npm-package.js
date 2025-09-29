const DEP_VERSION_REGEX = /['"`](.*)['"`]:['"`](.*)['"`]/;
const BLACKLIST = ['node_modules', 'favicon.ico'];

export class NPMPackage {
  constructor(dependency, disclosedNameOnly = false) {
    this.disclosedNameOnly = disclosedNameOnly;
    if (disclosedNameOnly) {
      this.name = dependency;
      this.version = null;
      this.nameWithVersion = `/node_modules/${dependency}`;
    } else {
      const match = dependency.match(DEP_VERSION_REGEX);
      if (match) {
        this.name = match[1];
        this.version = match[2];
        this.nameWithVersion = match[0];
      }
    }
  }

  isNameValid() {
    if (!this.name) return false;
    if (this.name.startsWith('.') || this.name.startsWith('_')) return false;
    if (this.name !== this.name.toLowerCase()) return false;
    if (/~|'|!|\(|\)|\*/.test(this.name)) return false;
    if (this.name.trim() !== this.name) return false;
    if (this.name.length === 0 || this.name.length > 214) return false;
    if (BLACKLIST.includes(this.name)) return false;
    return true;
  }

  isVersionValidNPM() {
    if (this.disclosedNameOnly) return true;
    if (!this.version) return false;
    return !/[\/@]|git|file|npm|link|bitbucket/i.test(this.version);
  }

  getOrgNameFromScopedDependency() {
    return this.name.replace(/^@/, '').replace(/\/.*$/, '');
  }

  getName() {
    return this.name;
  }

  getNameWithVersion() {
    return this.nameWithVersion || this.name || '';
  }
}

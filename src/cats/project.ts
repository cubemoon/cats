//
// Copyright (c) JBaron.  All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// 

module Cats {
    
    var typedoc;
    
    /**
     * The project hold the informaiton related to a single project. This include 
     * a reference to a worker thread that does much of the TypeScript intelli sense.
     */
    export class Project extends qx.event.Emitter {

        // The home directory of the project
        projectDir: string;
        name: string;

        private tsfiles: Array<string> = [];

        // The singleton TSWorker handler instance
        iSense: TSWorkerProxy;

        // Stores the project configuration paramters
        config: ProjectConfiguration;

        linter:Linter;

        /**    
         * Create a new project.
         */
        constructor(projectDir: string) {
            super();
            IDE.project = this;
            var dir = PATH.resolve(projectDir);
            this.projectDir = OS.File.switchToForwardSlashes(dir);
            this.refresh();
            if (this.config.codingStandards.useLint) this.linter = new Linter(this);
        }

        /**
         * Save the project configuration
         */     
        updateConfig(config) {
            this.config = config;
            this.emit("config", config);
            var pc = new ProjectConfig(this.projectDir);
            if (this.config.codingStandards.useLint) this.linter = new Linter(this);
            pc.store(this.config);
        }
        
    
        /**
         * Close the project
         */
        close() {
            if (IDE.editorTabView.hasUnsavedChanges()) {
                var c = confirm("You have some unsaved changes that will get lost.\n Continue anyway ?");
                if (!c) return;
            }
            IDE.editorTabView.closeAll();
            IDE.fileNavigator.clear();
            IDE.outlineNavigator.clear();
            IDE.problemResult.clear();
            if (this.iSense) this.iSense.stop();
        }

        /**
         * Show the errors on a project level
         */
        validate(verbose= true) {
            this.iSense.getAllDiagnostics((err, data) => {
                if (data) {
                    IDE.problemResult.setData(data);
                    if (data.length === 0) {
                        if (verbose) {
                            IDE.console.log("Project has no errors");
                        }
                    } 
                }

            });
        }


        /**
         * Build this project either with the built-in capabilities or by calling 
         * an external build tool.
         */
        build() {
            IDE.console.log("Start building project " + this.name + " ...");
            if (this.config.customBuild && this.config.customBuild.command) {
                // IDE.resultbar.selectOption(2);
                var cmd = this.config.customBuild.command;
                var options = this.config.customBuild.options || {cwd:null};

                if (!options.cwd) {
                    options.cwd = this.projectDir;
                }

                var child = OS.File.runCommand(cmd, options);

            } else {
                this.iSense.compile((err: Error, data: Cats.CompileResults) => {
                    this.showCompilationResults(data);
                    if (data.errors && (data.errors.length > 0)) return;
                    var sources = data.source;
                    sources.forEach((source) => {
                        OS.File.writeTextFile(source.fileName, source.content);
                    });
                    IDE.console.log("Done building project " + this.name + ".");
                });
            }
        }

        /**
         * Generate the documentation for this project
         */
        document() {
            var outputDir = this.config.documentation.outputDirectory;
            if (!outputDir) {
                alert("Please configure a output directoty Project -> Settings");
                return;
            }

            var win = new Gui.BusyWindow("Generating Documentation");
            win.show();
            win.addListenerOnce("ready", () => {
                try {

                    if (!typedoc) typedoc = require('typedoc');

                    var settings = new typedoc.Settings();
                    settings.name = this.name;
                    settings.compiler = JSON.parse(JSON.stringify(this.config.compiler));
                    settings.compiler.codepage = null;
                    settings.compiler.noLib = true;
                    settings.compiler.noResolve = true;
                    settings.compiler.mapRoot = "";
                    settings.compiler.sourceRoot = "";

                    var readme = "none";
                    if (this.config.documentation.readme && (this.config.documentation.readme !== "none")) {
                        readme = OS.File.join(this.projectDir, this.config.documentation.readme);
                    }
                   
                    settings.readme = readme;
                    settings.includeDeclarations = this.config.documentation.includeDeclarations || false;
                    settings.verbose = false;
                    settings.theme = this.config.documentation.theme || "default";
                    var app = new typedoc.Application(settings);
                    var dest = OS.File.join(this.projectDir, outputDir);
                    app.generate(this.tsfiles, dest);
                } finally {
                    win.hide();
                }
            });
        }

        /**
         *  Refresh the project and loads required artifacts
         *  again from the filesystem to be fully in sync
         */
        refresh() {
            var projectConfig = new ProjectConfig(this.projectDir);
            this.config = projectConfig.load();
            this.name = this.config.name || PATH.basename(this.projectDir);
            document.title = "CATS | " + this.name;

            // this.initJSSense();
            if (this.iSense) this.iSense.stop();
            this.iSense = new TSWorkerProxy(this);

            /*
            if (this.config.compiler.outFileOption) {
                this.config.compiler.outFileOption = OS.File.join(this.projectDir, this.config.compiler.outFileOption);
                console.info("Compiler output: " + this.config.compiler.outFileOption);
            }
            */

            this.iSense.setSettings(this.config.compiler, this.config.codingStandards);

            if (!this.config.compiler.noLib) {
                var fullName = OS.File.join(IDE.catsHomeDir, "typings/lib.d.ts");
                var libdts = OS.File.readTextFile(fullName);
                this.addScript(fullName, libdts);
            }

            var srcs = new Array<string>().concat(this.config.src);
            srcs.forEach((src: string) => {
                this.loadTypeScriptFiles(src);
            });

        }

        /**
         * Compile without actually saving the result
         */
        trialCompile() {
            this.iSense.compile((err: Error, data: Cats.CompileResults) => {
                this.showCompilationResults(data);
            });
        }

        private showCompilationResults(data: Cats.CompileResults) {

            if (data.errors && (data.errors.length > 0)) {
                IDE.problemResult.setData(data.errors);
                return;
            }

            IDE.problemResult.clear();
            IDE.console.log("Successfully compiled " + Object.keys(data.source).length + " file(s).");
        }

        /**
         * Run this project either with the built-in capabilities (only for web apps) or by calling 
         * and external command (for example node).
         */
        run() {
            if (this.config.customRun && this.config.customRun.command) {

                var cmd = this.config.customRun.command;
                var options = this.config.customRun.options || {cwd:null};
                if (!options.cwd) {
                    options.cwd = this.projectDir;
                }
                OS.File.runCommand(cmd, options);
            } else {

                var main = this.config.main;
                if (!main) {
                    alert("Please specify the main html file or customRun in the project settings.");
                    return;
                }
                var startPage = this.getStartURL();
                console.info("Opening file: " + startPage);
                var win2 = GUI.Window.open(startPage, {
                    toolbar: true,
                    webkit: {
                        "page-cache": false
                    }
                });
            }
        }

        /**
         * Get the URl for running the project
         */
        private getStartURL(): string {
            var url = OS.File.join(this.projectDir, this.config.main);
            return "file://" + url;
        }

       
       
        addScript(fullName: string, content: string) {
            this.iSense.addScript(fullName, content);
            if (this.tsfiles.indexOf(fullName) < 0) this.tsfiles.push(fullName);
        }

        /**
         * Load the TypeScript source files that match the pattern into the tsworker
         * @param pattern The pattern to apply when searching for files
         */
        private loadTypeScriptFiles(pattern: string) {
            if (!pattern) pattern = "**/*.ts";
            OS.File.find(pattern, this.projectDir, (err: Error, files: Array<string>) => {
                files.forEach((file) => {
                    try {
                        var fullName = OS.File.join(this.projectDir, file);
                        var content = OS.File.readTextFile(fullName);
                        this.addScript(fullName, content);
                    } catch (err) {
                        console.error("Got error while handling file " + fullName);
                        console.error(err);
                    }
                });
            });
        }


    }

}

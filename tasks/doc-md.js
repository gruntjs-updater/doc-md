

module.exports = function(grunt) {

    var jade = require('jade'),
        path = require('path'),
        fs = require('fs'),
        yaml = require('js-yaml'),
        cp = require('child_process'),
        htmlUtils = require('./lib/htmlUtils'),
        slang = require('slang');

    var buildAndLinkHtml = htmlUtils.buildAndLinkHtml;

    var convertObjectToArgs = function(options) {
        var args = [];
        Object.keys(options).forEach(function(key) {
            if (typeof options[key] === 'object') {
                Object.keys(options[key]).forEach(function(k) {
                    args.push('--' + slang.dasherize((key)));
                    args.push(k);
                    args.push(options[key][k]);
                })
            } else {
                args.push('--' + slang.dasherize(key));
                if (typeof options[key] === 'string' || typeof options[key] === 'number') {
                    args.push(options[key]);
                }
            }
        });
        return args;
    };

    var buildPdf = function (parameters) {
        if (parameters.pdfOutput) {
            var renderFooter = jade.compileFile(path.join(parameters.webDir, "footer.jade"));
            var footerUrl = path.resolve(path.join(parameters.output, parameters.guideFile + '.footer.html'));
            grunt.file.write(footerUrl,
                renderFooter({
                    content: {
                        left: parameters.properties.pdfFooter,
                        right: parameters.properties.brandIcon
                    }
                }));

            var args = convertObjectToArgs({
                pageSize: "Letter",
                marginTop: "1in",
                marginLeft: "1in",
                marginRight: "1in",
                marginBottom: "1in",
                footerHtml: 'file://' + footerUrl,
                printMediaType: true
            }).concat([parameters.guideFile + '.print.html', parameters.guideFile + '.pdf']);


            //if (parameters.properties.pdfFooter) {
            //    wkExec = wkExec + ' --variable=docFooter:"' + parameters.properties.pdfFooter + '"';
            //}
            //if (parameters.properties.brandIcon) {
            //    wkExec = wkExec + ' --variable=docFooterIcon:"' + parameters.properties.brandIcon + '"';
            //}

            cp.execFile('wkhtmltopdf', args, {
                cwd: parameters.output
            }, function (error, stdout, stderr) {
                if (error) {
                    grunt.warn("Error invoking wkhtmltopdf: " + error);
                }
                if (stderr) {
                    console.warn("Error creating " + parameters.guideFile + ".pdf with wkhtmltopdf: " + stderr);
                }
                grunt.file.copy(
                    path.join(parameters.output, parameters.guideFile + '.pdf'),
                    path.join(parameters.pdfOutput, parameters.guideFile + '.pdf')
                );
                grunt.file.delete(path.join(parameters.output, parameters.guideFile + '.pdf'), {force: true});
                parameters.markPdfFinished();
            });
        }
    };

    var processMarkdown = function(parameters) {
        var docDir = parameters.docDir;
        var properties = parameters.properties;
        var normalizeHeaders = properties['normalizeHeaders'] === undefined ? true : properties['normalizeHeaders'];
        var compiledContent = buildAndLinkHtml({
            'docDir': docDir,
            'normalizeHeaders': normalizeHeaders
        }, properties, 0);
        var renderForWeb = jade.compileFile(path.join(parameters.webDir, "index.jade"));
        var renderForPrint = jade.compileFile(path.join(parameters.webDir, "printer.jade"));
        compiledContent.guideLinks = htmlUtils.highlightCurrentGuide(parameters.guideLinks, parameters.guideFile + '.html');
        if (properties.brandIcon) {
            compiledContent.brandIcon = properties.brandIcon;
        }
        if (parameters.versionNumber) {
            compiledContent.versionNumber = parameters.versionNumber;
        }
        var output = renderForWeb({
            "content": compiledContent,
            "title": properties["name"]
        });
        var printOutput = renderForPrint({
            "content": compiledContent,
            "title": properties["name"]
        });
        //if (parameters.brandIcon && parameters.brandIcon.style) {
        //    output = htmlUtils.applyIconStyle(output, parameters.brandIcon.style);
        //}

        //buildPdf(parameters, compiledContent);

        var printHtml = path.join(parameters.output, parameters.guideFile + ".print.html");
        grunt.file.write(printHtml, printOutput);
        buildPdf(parameters);

        grunt.file.write(path.join(parameters.output, parameters.guideFile + '.html'), output);
    };

    var copyResources = function (options) {
        grunt.config('copy', {
            docmd_resources: {
                files: [
                    {
                        expand: true,
                        cwd: path.join(options.docs, options.resourcesName),
                        src: ["**/*"],
                        dest: path.join(options.output, options.resourcesName)
                    }
                ]
            },
            docmd_bower: {
                files: [
                    {
                        expand: true,
                        cwd: path.join(__dirname, "../bower_components"),
                        src: [
                            "*/dist/**/*"
                        ],
                        dest: path.join(options.output, 'lib')
                    }
                ]
            },
            docmd_user_lib: {
                files: [
                    {
                        expand: true,
                        cwd: path.join(options.webDir, 'lib'),
                        src: ["*"],
                        dest: path.join(options.output, 'lib')
                    }
                ]
            }

        });
        grunt.task.run('copy:docmd_resources', 'copy:docmd_bower', 'copy:docmd_user_lib');
    };
    var setupDirectories = function (options) {
        grunt.config('clean', {
            options: {
                force: true
            },
            docmd_lib: [
                path.join(options.webDir, "lib")
            ],
            docmd_output: [
                options.output
            ],
            docmd_pdf_output: [
                options.pdfOutput
            ]
        });
        grunt.task.run('clean:docmd_lib', 'clean:docmd_output');
        grunt.registerTask('docmd_setup', function () {
            grunt.file.mkdir(options.output);
            grunt.file.mkdir(path.join(options.webDir, 'lib'));
        });
        grunt.task.run('docmd_setup');
    };
    var handleWebDependencies = function (options) {
        process.chdir(path.join(__dirname, '../'));
        grunt.config('bower', {
            'options': {
                copy: false
            },
            'install': {}
        });
        grunt.task.run('bower');
        grunt.task.run('docmd_chdir');

        grunt.config('concat', {
            'docmd_user_js': {
                options: {
                    separator: ';\n'
                },
                src: [
                    path.join(options.jsDir, '*.js')
                ],
                dest: path.join(options.webDir, 'lib', 'user.js')
            },
            'docmd_user_css': {
                src: [
                    path.join(options.cssDir, '*.css')
                ],
                dest: path.join(options.webDir, 'lib', 'user.css')
            }
        });
        grunt.task.run('concat:docmd_user_js', 'concat:docmd_user_css');
    };

    grunt.registerTask('doc_md', function() {
        var options = this.options({
            webDir: path.join(__dirname, "../webpage"),
            resourcesName: "resources",
            jsDir: "./js",
            cssDir: "./css"
        });
        var dataDirs = options.directories;
        var base = grunt.option('base') || process.cwd();

        grunt.registerTask('docmd_chdir', function() {
            process.chdir(base);
        });

        if (!options.docs) {
            grunt.warn("docs directory not specified");
        }
        if (!options.output) {
            grunt.warn("output directory not specified");
        }
        if (!dataDirs || dataDirs.length == 0) {
            grunt.warn("markdown directory not specified");
        }

        grunt.loadNpmTasks('grunt-contrib-clean');
        grunt.loadNpmTasks('grunt-bower-concat');
        grunt.loadNpmTasks('grunt-contrib-concat');
        grunt.loadNpmTasks('grunt-contrib-copy');
        grunt.loadNpmTasks('grunt-bower-task');


        setupDirectories(options);

        handleWebDependencies(options);

        copyResources(options);

        grunt.registerTask('docmd_markdown', function() {
            var guides = [];
            dataDirs.forEach(function(directory) {
                var guide = {};
                var propsFile = path.join(options.docs, directory, "properties.yml");
                try {
                    var properties = yaml.safeLoad(fs.readFileSync(propsFile), {});
                } catch (YMLException) {
                    grunt.warn("Could not properly parse " + propsFile + " as a yaml file");
                }

                guide.propertiesFile = properties;
                guide.link = properties['referenceId'] || htmlUtils.buildId(properties['name']);
                guide.text = properties['name'];
                guide.directory = directory;

                guides.push(guide);
            });

            var guideLinksHtml = htmlUtils.buildGuideLinks(guides);

            if (options.pdfOutput) {
                var done = this.async();
                if (options.pdfPandocTemplate) {
                    var pdfPandocTemplate =  path.join(options.output, options.pdfPandocTemplate + '.latex');
                    grunt.file.copy(options.pdfPandocTemplate + '.latex', pdfPandocTemplate);
                }

                var markPdfFinished = function(guideIndex) {
                    guides[guideIndex].pdfFinished = true;
                    if (guides.every(function(guide) { return guide.pdfFinished; })) {
                        if (options.pdfPandocTemplate && !options.keepMarkdown) {
                            grunt.file.delete(pdfPandocTemplate, {force: true});
                        }
                        done(true);
                    }
                }
            }

            guides.forEach(function(guide, index) {
                processMarkdown({
                    webDir: options.webDir,
                    properties: guide.propertiesFile,
                    guideFile: guide.link,
                    guideLinks: guideLinksHtml,
                    output: options.output,
                    pdfOutput: options.pdfOutput,
                    pdfPandocTemplate: options.pdfPandocTemplate,
                    keepMarkdown: options.keepMarkdown,
                    markPdfFinished: function() {markPdfFinished(index);},
                    docDir: path.join(options.docs, guide.directory),
                    versionNumber: options.versionNumber
                });
            });
        });
        grunt.task.run('docmd_markdown');


    });
};



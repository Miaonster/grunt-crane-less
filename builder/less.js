var path    = require('path');
var URL     = require('url');
var less    = require('less');
var rework  = require('rework');
var promise = require('../util/promise');

var HTTP_FILE_RE = /^(https?:\/\/.*?\/)/;

var Parser = less.Parser;

module.exports = function (grunt) {
    var minify   = grunt.config('compress');
    var rootpath = grunt.config('rootpath');
    var dest     = grunt.config('dest');
    var src      = grunt.config('src');

    function Builder (id) {
        var self = this;

        this.id = id;
        this.content = grunt.file.read(src + id);
        this.parserDefer = promise.Deferred();

        var parser = new Parser({
            compress: minify,
            yuicompress: false,
            optimization: 1,
            silent: false,
            lint: false,
            color: true,
            strictImports: false,
            rootpath: rootpath,
            relativeUrls: true,
            strictMaths: true,
            paths: [src, path.dirname(path.resolve(src + id))]
        });

        parser.parse(this.content, function (err, tree) {
            if (err) {
                console.log(err.message);
                return self.parserDefer.reject(err.message);
            }

            var imports = Object.keys(parser.imports.files)
                .map(function (file) {
                    return path.resolve(file).replace(path.resolve(src) + '/', '');
                });
            var children = [];

            // 图片也算是一种children
            children = children.concat(imports);

            self.getChildren = function () {
                return children;
            };

            self.isCmbFile = function () {
                return !!children.length;
            };
            self.parserDefer.resolve(tree);
        });
    }

    Builder.prototype.build = function () {
        var self = this;
        var defer = promise.Deferred();
        var filename = self.id.replace(/\.less$/, '.css');

        this.parserDefer.done(function (tree) {
            var content = tree.toCSS({
                compress: minify
            });

            content = rework(content)
                .use(rework.url(function (url) {
                    var match = url.match(HTTP_FILE_RE);
                    var filepath;
                    if (match && rootpaths.indexOf(match[1]) === -1) {
                        return url;
                    }

                    // 获取文件的路径
                    if (match) {
                        filepath = url.replace(match[1], '');
                    } else {
                        filepath = path.normalize(path.dirname(self.id) + '/' + url);
                    }
                    filepath = URL.parse(filepath).pathname;

                    var version = +require('fs').statSync(src + filepath).mtime % grunt.config('cacheExpire');

                    return url + '?v=' + version;
                }))
                .toString();

            try {
                grunt.file.write(dest + filename, content);
            } catch (ex) {
                defer.resolve([]);
            }

            defer.resolve([filename]);
        }).fail(function () {
            defer.reject();
        });
        return defer.promise();
    }

    return Builder;
};

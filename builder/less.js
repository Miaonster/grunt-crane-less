var path    = require('path'),
    less    = require('less'),
    rework  = require('rework'),
    CSS     = require('css'),
    URL     = require('url'),
    MD5     = require('MD5'),
    EOL     = require('os').EOL,
    fs      = require('fs'),

    promise = require('../util/promise'),

    Parser  = less.Parser;

var HTTP_FILE_RE = /^(https?:\/\/.*?\/)/;

module.exports = function (grunt) {
    var minify   = grunt.option('compress');
    var rootpath = grunt.config('rootpath');
    var dest     = grunt.config('dest');
    var src      = grunt.config('src');

    function Builder (id) {
        var that = this;

        this.id = id;
        this.content = grunt.file.read(src + id);
        this.parserDefer = promise.Deferred();
        this.children = [];

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
                return that.parserDefer.reject(err.message);
            }

            var imports = Object.keys(parser.imports.files)
                .map(function (file) {
                    return path.resolve(file).replace(path.resolve(src) + '/', '');
                });
            var children = [];

            // 图片也算是一种children
            children = children.concat(imports);

            that.getChildren = function () {
                return children;
            };

            that.isCmbFile = function () {
                return !!children.length;
            };
            that.parserDefer.resolve(tree);
        });
    }

    Builder.prototype.build = function () {
        var that = this;
        var defer = promise.Deferred();
        var filename = that.id.replace(/\.less$/, '.css');

        function done(tree) {
            var content,
                rootpaths = grunt.config('rootpaths'),
                versionCache = {};

            try {
                content = tree.toCSS();
            } catch (ex) {
                return defer.resolve([filename]);
            }

            rework(content)
                .use(rework.url(function (url) {
                    url = URL.parse(url).pathname;

                    // 外部图片不计入children
                    if (/^https?:\/\//.test(url)) {
                        return url;
                    }

                    if (url.substr(0, 1) === '.') { // ../xxx.jpg
                        return that.children.push(path.normalize(path.dirname(that.id) + '/' + url));
                    } else if (url.substr(0, 1) === '/') { // /xxx/xxx/xxx.jpg
                        return that.children.push(url.substr(1));
                    } else { // xxx.jpg
                        return that.children.push(path.dirname(that.id) + '/' + url);
                    }
                }));

            that.children = grunt.util._.uniq(that.children);

            content = rework(content)
                .use(rework.url(function(url) {
                    var buffer,
                        filepath,
                        fullpath,
                        version,
                        match = url.match(HTTP_FILE_RE);

                    if (match && rootpaths.indexOf(match[1]) === -1) {
                        return url;
                    }

                    // 获取文件的路径
                    if (match) {
                        filepath = url.replace(match[1], '');
                    } else {
                        filepath = path.normalize(path.dirname(that.id) + '/' + url);
                    }

                    filepath = URL.parse(filepath).pathname;
                    fullpath = src + filepath;

                    if (!versionCache[fullpath]) {
                        try {
                            buffer = fs.readFileSync(fullpath);
                        } catch(ex) {
                            return defer.reject('Image no found: ' + url);
                        }
                        versionCache[fullpath] = MD5(buffer);
                    }

                    version = versionCache[fullpath];

                    //version = +require('fs').statSync(src + filepath).mtime % grunt.config('cacheExpire');

                    return url + '?v=' + version;
                }))
                .toString();

            if (minify) {
                content = CSS.parse(content);
                content = CSS.stringify(content, { compress: true });
            }

            try {
                grunt.file.write(dest + filename, content);
            } catch (ex) {
                defer.resolve([]);
            }

            defer.resolve([filename]);
        }

        function fail() {
            defer.reject();
        }

        this.parserDefer.done(done).fail(fail);

        return defer.promise();
    }

    return Builder;
};

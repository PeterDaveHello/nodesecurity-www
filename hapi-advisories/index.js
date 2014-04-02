var Hapi = null; // Initialized during plugin registration
var walk = require('walk');
var fs = require('fs');
var metamarked = require('meta-marked');
var path = require('path');
var semver = require('semver');
var jade = require('jade');
var RSS = require('rss');
var config = require('config');
var rss_config = config.rss;
var rss_base_url = config.rss_base_url;

var validate = require('./validate');

exports.name    = 'advisories';
exports.version = '1.0.0';

var internals = {};

internals.defaults = {
    rootDir: 'advisories',
    title: 'Advisories',
    views: './views',
    handler: function (request, config, next) {
        next();
    }
};

exports.register = function (plugin, options, next) {
    plugin.log(['info', 'hapi-advisories'], 'hapi-advisories plugin registered');

    internals.setHapi(plugin.hapi);
    var Utils = plugin.hapi.utils;
    var settings = Utils.applyToDefaults(internals.defaults, options);

    plugin.views({
        engines: { jade: 'jade' },
        path: settings.views
    });

    var toc = {};
    var module_index = {};
    var advisories = {};
    var advisories_templates = {};
    var advisories_html;
    // Uncomment this to work well (solution till fix the config module)
    rss_config.pubDate = new Date().toString();
    var advisories_rss_feed = new RSS(rss_config);
    var advisories_rss_xml;
    var previousDate = 0;
    var latest;
    options = {
        followLinks: false
    };

    var walker = walk.walk(settings.rootDir, options);

    walker.on('file', function (root, fileStats, next) {

        plugin.log(['debug', 'hapi-advisories', 'walker'], 'Attempting to load file ' + fileStats.name);
        
        if (fileStats.name === 'template.md') {
            plugin.log(['debug', 'hapi-advisories'], 'skipping template.md');
            return next();
        }

        if (root === settings.rootDir) {
            if (/\.md$/.test(fileStats.name)) {
                var filename = fileStats.name.replace(/\.md$/, '');
                var meta = metamarked(fs.readFileSync(path.resolve(settings.rootDir, fileStats.name), 'utf8'));
                meta.meta.url = filename;

                var currentDate;
                if (meta.meta.publish_date) {
                    currentDate = new Date(meta.meta.publish_date);
                } else {
                    currentDate = new Date();
                }

                // Create year index if it doesn't exist
                var year = currentDate.getFullYear();
                if (!toc[year]) {
                    toc[year] = [];
                }

                // Find the most recent advisory
                if (currentDate > previousDate) {
                    previousDate = currentDate;
                    toc[year].unshift(meta);
                    latest = meta;
                } else {
                    toc[year].push(meta);
                }
                advisories[meta.meta.url] = meta;
                plugin.log(['debug', 'hapi-advisories', 'jade'], 'rendering jade for: ' + settings.views + '/advisory.jade, ' + meta.meta.url);
                advisories_templates[meta.meta.url] = jade.renderFile(settings.views + '/advisory.jade', {advisory: advisories[meta.meta.url]});

                advisories_rss_feed.item({
                    title:  meta.meta.title,
                    description: meta.html,
                    url: rss_base_url + meta.meta.url,
                    author: meta.meta.author,
                    date: meta.meta.publish_date,
                });

                // Setup module_index index o_O
                if (!module_index[meta.meta.module_name]) {
                    module_index[meta.meta.module_name] = {};
                }
                module_index[meta.meta.module_name][meta.meta.publish_date] = meta.meta;
            }
        }
        next();
    });

    walker.on('errors', function (root, nodeStatsArray, next) {
        plugin.log(['error', 'hapi-advisories', 'walker'], 'Walker error happened, zomg');
        next();
    });

    walker.on('end', function () {
        plugin.log(['debug', 'hapi-advisories', 'walker'], 'Walker end');
        plugin.log(['debug', 'hapi-advisories', 'html'], 'render ' + settings.views + '/advisories.jade');
        advisories_html = jade.renderFile(settings.views + '/advisories.jade', {title: settings.title, index: toc, latest: latest});
        advisories_rss_xml = advisories_rss_feed.xml();
        next();
    });

    // Index route for all advisories
    plugin.route({ method: 'GET', path: '/advisories', handler: function (request, reply) {
        reply(advisories_html);
    }});

    // Individual advisory handler
    plugin.route({ method: 'GET', path: '/advisories/{advisory}', handler: function (request, reply) {
        if (advisories_templates[request.params.advisory]) {
            return reply(advisories_templates[request.params.advisory]);
        }
        return reply(Hapi.boom.notFound());
    }});

    plugin.route({ method: 'GET', path: '/advisories/module/{module_name}', handler: function (request, reply) {
        if (module_index[request.params.module_name]) {
            return reply.view('module_advisory_list', {index: module_index[request.params.module_name]});
        }
        return reply(Hapi.boom.notFound());
    }});


    plugin.route({ method: 'GET', path: '/rss.xml', handler: function (request, reply) {
        return reply(advisories_rss_xml).type('text/xml');
    }});




    // npm shrinkwrap search
    plugin.route({
        method: 'POST',
        path: '/validate/shrinkwrap',
        config: {
            payload: {
                allow: 'application/json'
            }
        },
        handler: function (request, reply) {
            reply(validate(request.payload, module_index));
        }
    });

    plugin.route({
        method: 'GET',
        path: '/validate/{module}/{version}',
        handler: function (request, reply) {
            var data = module_index[request.params.module] || {};
            var result = [];
            Object.keys(data).forEach(function (key) {
                var advisory = data[key];
                if (semver.valid(request.params.version) && semver.satisfies(request.params.version, advisory.vulnerable_versions)) {
                    result.push(advisory);
                }
            });
            reply(result);
        }
    });

};


internals.setHapi = function (module) {
    Hapi = Hapi || module;
};

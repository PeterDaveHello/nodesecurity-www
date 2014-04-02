var Hapi = require('hapi');
var config = require('config');
var advisories = require('./hapi-advisories');

// Create a server with a host and port
var server = Hapi.createServer(config.hapi.host, config.hapi.port, config.hapi.options);

server.pack.require('bucker', config.bucker, function (err) {
    if (err) {
        console.error('failed loading bucker plugin');
    }
});


server.views({
    engines: {
        jade: 'jade',
    },
    path: './views'
});

server.route({
    method: 'GET',
    path: '/',
    handler: {
        view: 'index'
    }
});

server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
        directory: { path: './public', listing: false, index: true }
    }
});

server.route({
    method: 'GET',
    path: '/resources',
    handler: {
        view: 'resources'
    }
});

server.pack.register(advisories, {}, function (err) {
    if (err) {
        console.log('Failed to load plugin: ' + err);
    } else {
        console.log('Loaded advisories');
        // Start the server
        server.start(function () {
            console.log('Started Server on PORT: ' + config.hapi.port);
        });
    }
});


// Deal with errors
server.ext('onPreResponse', function (request, reply) {
    var response = request.response;
    if (!response.isBoom) {
        return reply();
    }

    // Replace error with friendly HTML

    var error = response;
    var ctx = {
        message: (error.output.statusCode === 404 ? 'page not found' : 'something went wrong')
    };

    reply.view('error', ctx);
});


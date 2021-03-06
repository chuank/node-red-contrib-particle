/**
 * 	https://github.com/chuank/node-red-contrib-particle
 *
 * @format
 */

module.exports = function(RED) {
	'use strict';
	var Particle = require('particle-api-js');

	// ******************************************
	// Configuration module - handles credentials
	// ******************************************
	function ParticleCloudNode(n) {
		var that = this;

		RED.nodes.createNode(this, n);

		this.host = n.host;
		this.port = n.port;
		this.name = n.name;

		// create one particle-api-js instance per cloud connection
		this.particleJS = new Particle();
		// this.particleJS.debug = true;
		if (this.host != 'https://api.particle.io') {
			this.particleJS.baseUrl = this.host + ':' + this.port;
		}

		// the login approach here is to rely on a pre-defined access token that you can retrieve
		// from your own Particle.io account since most JS API calls rely on a valid authentication
		// token. Login mechanism (authentication, MFA) is not supported.

		this.on('close', (removed, done) => {
			if (removed) {
				that.trace('ParticleCloudNode config node removed');
			} else {
				that.trace('ParticleCloudNode config node restarted');
			}
			if (done) done();
		});
	}
	// register the existence of the Particle Cloud credentials configuration node
	RED.nodes.registerType('particle-cloud', ParticleCloudNode, {
		credentials: {
			accesstoken: { type: 'password' }
		}
	});

	// **********************************************************************************
	// ParticleUtility node - for calling basic utility functions via the Particle JS API
	// **********************************************************************************
	function ParticleUtility(n) {
		// note: code in here runs whenever flow is re-deployed.
		// the node-RED 'n' object refers to a node's instance configuration and so is unique between ParticleSSE nodes

		var that = this;

		RED.nodes.createNode(this, n);

		// Get all properties from node instance settings
		this.pcloud = RED.nodes.getNode(n.pcloud);
		this.utilitytype = n.utilitytype;
		this.devid = n.devid;
		this.payload = null;
		this.productIdOrSlug = n.productIdOrSlug;
		this.timeoutDelay = 5; // ms

		// keep track of updated state (for updating status icons)
		this.propChanged = false;

		this.pcloud.host === 'https://api.particle.io'
			? (this.isLocal = false)
			: (this.isLocal = true);

		if (!this.pcloud.credentials.accesstoken) {
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No Particle access token'
			});
			this.error('No Particle access token in configuration node');
		} else {
			this.status({});
		}

		// Called when there's input from upstream node(s)
		this.on('input', (msg, send, done) => {
			// Retrieve all parameters from Message
			let val = msg;
			let validOp = false;

			let options = {
				auth: that.pcloud.credentials.accesstoken
			};

			// ignore if incoming message is invalid; otherwise store incoming message as new event name
			if (val) {
				if (val.topic === 'devid') {
					if (!val.payload) {
						// ignore bad incoming payload
						that.warn('Ignored invalid new devid');
					} else {
						that.devid = val.payload;
						that.propChanged = true;
						that.trace('new devID: ' + that.devid);
					}
				} else if (val.topic === 'productIdOrSlug') {
					if (!val.payload) {
						// ignore bad incoming payload
						that.warn('Ignored invalid new productIdOrSlug');
					} else {
						that.productIdOrSlug = val.payload;
						that.propChanged = true;
						that.trace('new productIdOrSlug: ' + that.productIdOrSlug);
					}
				}

				that.trace('Calling utility: ' + that.utilitytype);
                                var deviceToSendTo=that.devid;
                                if (that.devid.trim().startsWith('{')){
                                       try{
                                          deviceToSendTo=eval('val.'+that.devid.replace(/[{}]/g,''));
                                       } catch (e) {
                                          that.error('Error while parsing DeviceId substitution :'+e);
                                          return;
                                       }
                                }
				switch (that.utilitytype) {
					case 'listDevices':
						validOp = true;
						break;
                                        case 'nameDevice':
                                                validOp = true;
                                                options.deviceId = deviceToSendTo;
                                                options.name = val.payload;
                                                break;
                                        case 'claimDevice':
                                                validOp = true;
                                                options.deviceId = deviceToSendTo;
                                                break;
					case 'getDevice':
					case 'signalDevice':
                                                that.trace('\tDevice ID: ' + deviceToSendTo);
                                                options.signal = (val.payload == true);         // convert payload into true/false (loose conversion)
                                                options.deviceId = deviceToSendTo;
                                                validOp = true;
                                                break;
                                        case 'addDeviceToProduct':
                                                options.deviceId = deviceToSendTo;
                                                options.product = val.payload;
						validOp = true;
						break;
					default:
						validOp = false;
				}
			}

			if (validOp) {
				if (that.productIdOrSlug) {
					options.product = that.productIdOrSlug;
					that.trace('\tProductID: ' + that.productIdOrSlug);
				}

				var utilPr;
				switch (that.utilitytype) {
					case 'listDevices':
						utilPr = that.pcloud.particleJS.listDevices(options);
						break;
					case 'getDevice':
						utilPr = that.pcloud.particleJS.getDevice(options);
						break;
                                        case 'addDeviceToProduct':
                                                that.trace('Add device to Product :'+JSON.stringify(options));
                                                utilPr = that.pcloud.particleJS.addDeviceToProduct(options);
                                                break;
                                        case 'nameDevice':
                                                that.trace('Naming a device :'+JSON.stringify(options));
                                                utilPr = that.pcloud.particleJS.renameDevice(options);
                                                break;
                                        case 'claimDevice':
                                                that.trace('Claiming a device :'+JSON.stringify(options));
                                                utilPr = that.pcloud.particleJS.claimDevice(options);
                                                break;
					case 'signalDevice':
						utilPr = that.pcloud.particleJS.signalDevice(options);
						break;
				}

				utilPr
					.then(data => {
						if (data.statusCode == 200) {
							that.trace('Utility call successful');
							let msg = {
								payload: data.body,
								statusCode: data.statusCode
							};
							that.send(msg);
						}
					})
					.catch(err => {
						that.error(err.body.error, err.body);
					});
			} else {
				that.error('Invalid utility type');
			}

			if (done) done();
		});

		this.on('close', (removed, done) => {
			// close
			if (done) done();
		});
	}
	// register ParticleUtility node
	RED.nodes.registerType('particle-util', ParticleUtility);
	// end ParticleUtility

	// *********************************************************************
	// ParticleSSE node - base module for subscribing to Particle Cloud SSEs
	// *********************************************************************
	function ParticleSSE(n) {
		// note: code in here runs whenever flow is re-deployed.
		// the node-RED 'n' object refers to a node's instance configuration and so is unique between ParticleSSE nodes

		var that = this;

		RED.nodes.createNode(this, n);

		// Get all properties from node instance settings
		this.pcloud = RED.nodes.getNode(n.pcloud);
		this.subscribetype = n.subscribetype;
		this.devprodslug = n.devprodslug;
		this.evtname = n.evtname;
		this.strict = n.strict;
		this.timeoutDelay = 5; // ms
		this.keepaliveInterval = 5 * 60 * 1000; // ms; every 5 minutes

		// keep track of updated state (for updating status icons)
		this.propChanged = false;

		this.pcloud.host === 'https://api.particle.io'
			? (this.isLocal = false)
			: (this.isLocal = true);

		if (!this.pcloud.credentials.accesstoken) {
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No Particle access token'
			});
			this.error('No Particle access token in configuration node');
		} else {
			this.status({});
		}

		setTimeout(() => {
			that.emit('initSSE', {});
		}, this.timeoutDelay);

		// as an extra layer of sanity check, force reconnects at keepaliveInterval
		this.particleinterval = setInterval(() => {
			that.emit('initSSE', {});
		}, this.keepaliveInterval);

		// Called when there's input from upstream node(s)
		this.on('input', (msg, send, done) => {
			// Retrieve all parameters from Message
			let validOp = false;
			let val = msg;

			// ignore if incoming message is invalid; otherwise store incoming message as new event name
			if (!val) {
				if (val.topic === 'evtname') {
					that.evtname = val.payload;
					if (that.evtname.length > 64) {
						that.warn('Incoming SSE Event name > 64 chars, truncating...');
						that.evtname = that.evtname.substring(0, 64);
					}
					that.propChanged = true;
					that.trace('new eventname: ' + that.evtname);
					validOp = true;
				} else if (val.topic === 'devid') {
					that.devprodslug = val.payload;
					that.propChanged = true;
					that.trace(
						'new devID: ' +
							(that.devprodslug === ''
								? '(noDevID/firehose)'
								: that.devprodslug)
					);
					validOp = true;
				} else if (val.topic === 'strict') {
					that.strict = val.payload;
					that.trace('strict flag changed: ' + that.strict);
					validOp = true;
				} else if (val.topic === 'productIdOrSlug') {
					if (!val.payload) {
						// ignore bad incoming payload
						that.warn('Ignored invalid new productIdOrSlug');
					} else {
						that.productIdOrSlug = val.payload;
						that.propChanged = true;
						that.trace('new productIdOrSlug: ' + that.productIdOrSlug);
						validOp = true;
					}
				} else if (val.topic === 'orgSlug') {
					if (!val.payload) {
						// ignore bad incoming payload
						that.warn('Ignored invalid new orgSlug');
					} else {
						that.orgSlug = val.payload;
						that.propChanged = true;
						that.trace('new orgSlug: ' + that.orgSlug);
						validOp = true;
					}
				} else if (val.topic === 'reconnect') {
					validOp = true;
				}
			}

			if (validOp) {
				// show 'reconnecting status' while the new parameters are setup
				that.status({
					fill: 'yellow',
					shape: 'dot',
					text: 'Reconnecting...'
				});

				// only reconnect if we have a valid update to do
				setTimeout(() => {
					that.emit('initSSE', {});
				}, that.timeoutDelay);
			}

			if (done) done();
		});

		// SSE (Server-Sent-Event) Subscription
		this.on('initSSE', () => {
			// sanity check: close any pre-existing, open connections
			if (that.stream) {
				that.trace('### initSSE aborting pre-existing ES');
				that.stream.abort();
				that.stream.end();
			}

			that.status({
				fill: 'yellow',
				shape: 'dot',
				text: 'Connecting...'
			});
			that.trace('Connecting...');

			// if we're dealing with a local cloud, or if device ID is empty, fallback to public/event firehose & ignore device ID

			// setup options depending on node settings
			let options = {
				auth: String(that.pcloud.credentials.accesstoken)
			};

			if (that.evtname) {
				options.name = String(that.evtname);
			}

			switch (that.subscribetype) {
				case 'devid':
					options.deviceId = String(that.devprodslug);
					break;
				case 'mine':
					options.deviceId = 'mine';
					break;
				case 'all':
					break;
				case 'productIdOrSlug':
					options.product = String(that.devprodslug);
					break;
				case 'orgSlug':
					options.org = String(that.devprodslug);
					break;
			}

			that.pcloud.particleJS
				.getEventStream(options)
				.then(stream => {
					// store reference to EventStream object returned by the Promise
					that.stream = stream;

					that.status({
						fill: 'green',
						shape: that.propChanged ? 'ring' : 'dot',
						text: that.propChanged ? 'Property UPDATED OK' : 'Connected'
					});
					that.trace('Connected');

					stream.on('event', data => {
						try {
							let msg = { payload: data };

							// BREAKING CHANGE: now passes the returned result from Particle as a JSON object as msg.payload
							if (!that.strict) {
								that.trace(JSON.stringify(data));
								that.send(msg);
							} else {
								if (data.name === that.evtname) {
									that.trace(JSON.stringify(data));
									that.send(msg);
								}
							}
						} catch (error) {
							that.error(JSON.stringify(error), error);
						}
					});

					stream.on('end', () => {
						that.error(
							'SSE eventstream ended! Attempting re-connect in 3 seconds...'
						);

						setTimeout(() => {
							that.emit('initSSE', {});
						}, 3 * 1000);
					});

					stream.on('error', error => {
						that.status({
							fill: 'red',
							shape: 'dot',
							text: 'Stream error - refer to debug/log'
						});
						that.error(JSON.stringify(error));
					});
				})
				.catch(err => {
					that.status({
						fill: 'red',
						shape: 'dot',
						text: 'Error - refer to debug/log'
					});
					that.error(err.body.error, err.body);
				});
		});

		this.on('close', (removed, done) => {
			that.status({
				fill: 'grey',
				shape: 'dot',
				text: 'Closed'
			});

			// i.e. closing of node, NOT the eventstream
			clearInterval(that.particleinterval);
			that.trace('Closed');

			// close any pre-existing, open connections
			if (that.stream) {
				that.trace('GC EventStream');
				that.stream.abort();
				that.stream.end();
			}

			if (done) done();
		});
	}
	// register ParticleSSE node
	RED.nodes.registerType('particle-SSE', ParticleSSE);
	// end ParticleSSE

	// **************************************************************************
	// ParticlePublish node - base module for submitting events to Particle Cloud
	// **************************************************************************
	function ParticlePublish(n) {
		// note:
		// the node-RED 'n' object refers to a node's instance configuration and so is unique between ParticlePublish nodes

		var that = this;

		RED.nodes.createNode(this, n);

		// Get all properties from node instance settings
		this.pcloud = RED.nodes.getNode(n.pcloud);
		this.evtname = n.evtname; // name of Particle Event to publish
		this.param = n.param; // string data to send as part of published Particle Event
		this.productIdOrSlug = n.productIdOrSlug;
		this.private = n.private;
		this.evtnametopic = n.evtnametopic;
		if (!n.ttl) {
			this.ttl = 60;
		} else {
			this.ttl = n.ttl;
		}
		this.repeat = Number(n.repeat) * 1000;
		this.interval_id = null;
		this.once = n.once;
		this.timeoutDelay = 5; // ms

		// keep track of updated state (for updating status icons)
		this.propChanged = false;

		this.pcloud.host === 'https://api.particle.io'
			? (this.isLocal = false)
			: (this.isLocal = true);

		if (!this.pcloud.credentials.accesstoken) {
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No Particle access token'
			});
			this.error('No Particle access token in configuration node');
		} else {
			this.status({});
		}

		if (this.once) {
			// run on init, if requested
			setTimeout(() => {
				that.emit('callPublish', {});
			}, this.timeoutDelay);
		}

		// Called when there's an input from upstream node(s)
		this.on('input', (msg, send, done) => {
			// Retrieve all parameters from Message
			let validOp = false;
			let repeatChanged = false;
			let val = msg;
			let execPub = false;

			// ignore if incoming message is invalid
			if (val) {
				if (val.topic === 'evtname') {
					// set new Event name; does not trigger publish Event
					that.evtname = val.payload;
					if (that.evtname.length > 64) {
						that.warn('Incoming Publish Event name > 64 chars, truncating...');
						that.evtname = that.evtname.substring(0, 64);
					}
					that.propChanged = true;
					that.trace('New published Event name: ' + that.evtname);
					validOp = true;
				} else if (val.topic === 'param') {
					// new param (string data); trigger publish Event AND send param
					let pl = JSON.stringify(val.payload);
					if (pl.length > 622) {
						that.warn('Incoming Publish data > 622 chars, truncating...');
						pl = pl.substring(0, 622);
					}
					that.param = pl;
					that.trace('New param: ' + that.param);
					validOp = execPub = true;
				} else if (that.evtnametopic && val.topic.length > 0) {
					// alternative usage mode: if user has selected the "Send Event Name, Data as msg.topic/msg.payload" option
					that.evtname = val.topic;
					if (that.evtname.length > 64) {
						that.warn('Incoming Publish Event name > 64 chars, truncating...');
						that.evtname = that.evtname.substring(0, 64);
					}

					let pl = JSON.stringify(val.payload);
					if (pl.length > 622) {
						that.warn('Incoming Publish data > 622 chars, truncating...');
						pl = pl.substring(0, 622);
					}
					that.param = pl;
					that.trace(
						'evtnametopic publish Event: ' + that.evtname + ' : ' + that.param
					);
					validOp = execPub = true;
				} else if (val.topic === 'private') {
					// new private flag
					if (val.payload) {
						that.private = true;
					} else {
						that.private = false;
					}
				} else if (val.topic === 'ttl') {
					// new publish event TTL
					that.ttl = Math.min(16777216, Math.max(0, Number(val.payload))); // clamp within allowed range
					that.trace('New TTL (s): ' + that.repeat);
					validOp = true;
				} else if (val.topic === 'repeat') {
					// new repeat interval; updates interval timer (which in turn will trigger publish Event)
					val.payload = Number(val.payload) * 1000;
					that.repeat = val.payload;
					that.trace('New repeat (ms): ' + that.repeat);
					validOp = repeatChanged = true;
				} else if (!val.topic && val.payload) {
					// an incoming message with ANY msg.payload and NO msg.topic is considered a 'shortcut' call.
					let pl = JSON.stringify(val.payload);
					if (pl.length > 622) {
						that.warn('Incoming Publish data > 622 chars, truncating...');
						pl = pl.substring(0, 622);
					}
					that.param = pl;
					validOp = execPub = true;
					that.trace('shortcut publish Event: ' + that.evtname);
				}
			}

			if (validOp) {
				// signal to user that incoming messages have modified node settings
				if (execPub) {
					that.status({
						fill: 'blue',
						shape: 'dot',
						text: that.evtname + ':' + that.param + ' SENT'
					});
				} else {
					that.status({
						fill: 'green',
						shape: 'ring',
						text: val.topic + ' changed to ' + val.payload
					});
				}

				if (repeatChanged) {
					// clear previous interval as we're setting this up again
					clearInterval(that.interval_id);
					that.interval_id = null;

					setTimeout(() => {
						that.emit('processPublish', {});
					}, that.timeoutDelay);
				}
			}

			if (execPub) {
				if (!that.evtname) {
					// Catch blank event name; worst-case situation
					that.warn('No Event name defined, reverting to "NodeRED"');
					that.evtname = 'NodeRED';
				}

				if (val && val.payload && val.payload.length > 0) {
					that.param = val.payload;
				}

				setTimeout(() => {
					that.emit('processPublish', {});
				}, that.timeoutDelay);
			}

			if (done) done();
		});

		// Perform operations based on the method parameter.
		this.on('processPublish', () => {
			// Check for repeat and start timer
			if (that.repeat && !isNaN(that.repeat) && that.repeat > 0) {
				that.trace('Setting new repeat rate (ms):', that.repeat);

				that.interval_id = setInterval(() => {
					that.emit('callPublish', {});
				}, that.repeat);
			}
			// There is no repeat, just start once
			else if (that.evtname && that.evtname.length > 0) {
				that.trace('Event published');

				setTimeout(() => {
					that.emit('callPublish', {});
				}, that.timeoutDelay);
			}
		});

		// Execute actual Publish Event call
		this.on('callPublish', () => {
			let options = {
				name: String(that.evtname),
				data: String(that.param),
				isPrivate: that.private,
				auth: String(that.pcloud.credentials.accesstoken)
			};

			if (that.productIdOrSlug) options.product = that.productIdOrSlug;

			var publishEventPr = that.pcloud.particleJS.publishEvent(options);

			publishEventPr
				.then(
					data => {
						if (data.statusCode === 200) {
							that.trace('Event published successfully');
							let msg = { payload: true };
							that.send(msg);
						}
					}
				)
				.catch(err => {
					that.error(err.body.error, err.body);
				});

			that.trace('Publishing event: ' + JSON.stringify(options));
		});

		this.on('close', (removed, done) => {
			if (that.interval_id) {
				that.trace('Repeat interval closed.');
				clearInterval(that.interval_id);
			}

			if (done) done();
		});
	}
	// register ParticlePublish node
	RED.nodes.registerType('particle-pub', ParticlePublish);
	// end ParticlePublish

	// ***************************************************************************
	// ParticleFunc node - base module for calling Particle device cloud functions
	// ***************************************************************************
	function ParticleFunc(n) {
		// note: code in here runs whenever flow is re-deployed.
		// the node-RED 'n' object refers to a node's instance configuration and so is unique between ParticleFunc nodes

		var that = this;

		RED.nodes.createNode(this, n);

		// Get all properties
		this.pcloud = RED.nodes.getNode(n.pcloud);
		this.devid = n.devid;
		this.fname = n.fname;
		this.param = n.param;
		this.payload = null;
		this.productIdOrSlug = n.productIdOrSlug;
		this.repeat = n.repeat * 1000;
		this.interval_id = null;
		this.once = n.once;
		this.timeoutDelay = 5; //ms

		this.pcloud.host === 'https://api.particle.io'
			? (this.isLocal = false)
			: (this.isLocal = true);

		if (!this.pcloud.credentials.accesstoken) {
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No Particle access token'
			});
			this.error('No Particle access token in configuration node');
		} else {
			this.status({});
		}

		// Check device id
		if (!this.devid) {
			this.status({
				fill: 'yellow',
				shape: 'dot',
				text: 'No Device ID'
			});
			this.error('No Particle Device ID set');
		} else {
			this.status({});
		}

		if (this.once) {
			// run on init, if requested
			setTimeout(() => {
				that.emit('processFunc', {});
			}, this.timeoutDelay);
		}

		// Called when there's an input from upstream node(s)
		this.on('input', (msg, send, done) => {
			// Retrieve all parameters from Message
			var validOp = false;
			var repeatChanged = false;
			var val = msg;
			var execFunc = false;

			// ignore if incoming message is invalid
			if (val) {
				if (val.topic === 'devid') {
					that.devid = val.payload;
					that.trace('new devid: ' + that.devid);
					validOp = true;
				} else if (val.topic === 'fname') {
					that.fname = val.payload;
					if (that.fname.length > 64) {
						that.warn('Incoming Function name > 64 chars, truncating...');
						that.fname = that.fname.substring(0, 64);
					}
					that.trace('new funcName: ' + that.fname);
					validOp = true;
				} else if (val.topic === 'param') {
					that.param = val.payload;
					if (that.param.length > 622) {
						that.warn('Incoming Function data > 622 chars, truncating...');
						that.param = that.param.substring(0, 622);
					}
					that.trace('new param: ' + that.param);
					validOp = execFunc = true;
				} else if (val.topic === 'repeat') {
					that.repeat = Number(val.payload) * 1000;
					that.trace('new repeat (ms): ' + that.repeat);
					validOp = repeatChanged = true;
				} else if (!val.topic && val.payload) {
					// 'shortcut' mode - easier way to call the function without specifying "param" as topic
					that.payload = val.payload;
					if (that.param.length > 622) {
						that.warn('Incoming Function data > 622 chars, truncating...');
						that.param = that.param.substring(0, 622);
					}
					validOp = execFunc = true;
					that.trace('shortcut func call: ' + that.param);
				}
			}

			if (validOp) {
				// signal to user that incoming messages have modified node settings
				if (execFunc) {
					that.status({
						fill: 'blue',
						shape: 'dot',
						text: val.payload
					});
				} else {
					that.status({
						fill: 'green',
						shape: 'ring',
						text: val.topic + ' changed to ' + val.payload
					});
				}

				if (repeatChanged) {
					// clear previous interval as we're setting this up again
					clearInterval(that.interval_id);
					that.interval_id = null;

					setTimeout(() => {
						that.emit('processFunc', {});
					}, that.timeoutDelay);
				}
			}

			if (execFunc) {
				val = msg.payload;
				// Retrieve payload as param
				if (val && val.length > 0) {
					that.payload = val;
				}

				setTimeout(() => {
					that.emit('processFunc', {});
				}, that.timeoutDelay);
			}

			if (done) done();
		});

		// Call Particle Function
		this.on('processFunc', () => {
			// Check for repeat and start timer
			if (that.repeat && !isNaN(that.repeat) && that.repeat > 0) {
				that.trace('new repeat (ms):', that.repeat);

				that.interval_id = setInterval(() => {
					that.emit('callFunc', {});
				}, that.repeat);
			}
			// There is no repeat, just start once
			else if (that.fname && that.fname.length > 0) {
				setTimeout(() => {
					that.emit('callFunc', {});
				}, that.timeoutDelay);
			}
		});

		// Execute actual Particle Device function call
		this.on('callFunc', () => {
			var paramToSend = that.payload;
			var deviceToSendTo = that.devid;
			if (that.devid.trim().startsWith('{')) {
				try {
					deviceToSendTo = eval('that.' + that.devid.replace(/[{}]/g, ''));
				} catch (e) {
					that.error('Error while parsing DeviceId substitution :' + e);
					return;
				}
			}
			if (that.param.trim().startsWith('{')) {
				try {
					paramToSend = eval('that.' + that.param.replace(/[{}]/g, ''));
				} catch (e) {
					that.error('Error while parsing Parameter substitution :' + e);
					return;
				}
			}
			let options = {
				auth: String(that.pcloud.credentials.accesstoken),
				deviceId: String(deviceToSendTo),
				name: String(that.fname),
				argument: String(paramToSend)
			};

			if (that.productIdOrSlug) options.product = that.productIdOrSlug;

			that.trace('Calling function...');
			that.trace('\t\tDevice ID: ' + deviceToSendTo);
			that.trace('\t\tFunction Name: ' + that.fname);
			that.trace('\t\tParameter(s): ' + paramToSend);

			var fnPr = that.pcloud.particleJS.callFunction(options);
			fnPr
				.then(data => {
					if (data.statusCode == 200) {
						that.trace('Function published successfully');
						let msg = {
							raw: data.body,
							payload: data.body.return_value,
							id: data.body.id
						};
						that.send(msg);
					}
				})
				.catch(err => {
					that.error(err.body.error, err.body);
				});
		});

		this.on('close', (removed, done) => {
			if (that.interval_id) {
				that.trace('Interval closed.');
				clearInterval(that.interval_id);
			}

			if (done) done();
		});
	}
	// register ParticleFunc node
	RED.nodes.registerType('particle-func', ParticleFunc);
	// end ParticleFunc

	// ***********************************************************************
	// ParticleVar node - base module for retrieving Particle device variables
	// ***********************************************************************
	function ParticleVar(n) {
		// note: code in here runs whenever flow is re-deployed.
		// the node-RED 'n' object refers to a node's instance configuration and so is unique between ParticleVar nodes

		var that = this;

		RED.nodes.createNode(this, n);

		// Get all properties
		this.pcloud = RED.nodes.getNode(n.pcloud);
		this.devid = n.devid;
		this.getvar = n.getvar;
		this.productIdOrSlug = n.productIdOrSlug;
		this.repeat = n.repeat * 1000;
		this.interval_id = null;
		this.once = n.once;
		this.timeoutDelay = 5;

		this.pcloud.host === 'https://api.particle.io'
			? (this.isLocal = false)
			: (this.isLocal = true);

		if (!this.pcloud.credentials.accesstoken) {
			this.status({
				fill: 'red',
				shape: 'dot',
				text: 'No Particle access token'
			});
			this.error('No Particle access token in configuration node');
		} else {
			this.status({});
		}

		// Check device id
		if (!this.devid) {
			this.status({
				fill: 'yellow',
				shape: 'dot',
				text: ''
			});
			this.error('No Particle Device ID set');
		} else {
			this.status({});
		}

		if (this.once) {
			// run on init, if requested
			setTimeout(() => {
				that.emit('processVar', {});
			}, this.timeoutDelay);
		}

		// Called when there's an input from upstream node(s)
		this.on('input', msg => {
			// Retrieve all parameters from Message
			var validOp = false;
			var repeatChanged = false;
			var val = msg;

			// ignore if incoming message is invalid
			if (val) {
				if (val.topic === 'devid') {
					that.devid = val.payload;
					that.trace('new devid: ' + that.devid);
					validOp = true;
				} else if (val.topic === 'getvar') {
					that.getvar = val.payload;
					if (that.getvar.length > 64) {
						that.warn('Incoming Variable name > 64 chars, truncating...');
						that.getvar = that.getvar.substring(0, 64);
					}
					that.trace('new varName: ' + that.getvar);
					validOp = true;
				} else if (val.topic === 'repeat') {
					val.payload = Number(val.payload) * 1000;
					that.repeat = val.payload;
					that.trace('new repeat (ms): ' + that.repeat);
					validOp = repeatChanged = true;
				}
			}

			if (validOp) {
				// here we signal that incoming messages have modified node settings
				that.status({
					fill: 'green',
					shape: 'ring',
					text: val.topic + ' modified to ' + val.payload
				});

				if (repeatChanged) {
					// clear previous interval as we're setting this up again
					clearInterval(that.interval_id);
					that.interval_id = null;

					setTimeout(() => {
						that.emit('processVar', {});
					}, that.timeoutDelay);
				}
			} else {
				// it's just a regular variable request; any incoming message (even 'empty' ones) are fine

				setTimeout(() => {
					that.emit('getVar', {});
				}, that.timeoutDelay);
			}
		});

		// Perform operations based on the method parameter.
		this.on('processVar', () => {
			// Check for repeat and start timer
			if (that.repeat && !isNaN(that.repeat) && that.repeat > 0) {
				that.interval_id = setInterval(() => {
					that.emit('getVar', {});
				}, that.repeat);
			}
			// There is no repeat, just start once
			else if (that.getvar && that.getvar.length > 0) {
				setTimeout(() => {
					that.emit('getVar', {});
				}, that.timeoutDelay);
			}
		});

		// Read Particle Device variable
		this.on('getVar', () => {
			that.trace('Retrieving variable...');
			that.trace('\t\tDevice ID: ' + that.devid);
			that.trace('\t\tVariable Name: ' + that.getvar);
			if (that.productIdOrSlug)
				that.trace('\tProduct: ' + that.productIdOrSlug);

			let options = {
				auth: String(that.pcloud.credentials.accesstoken),
				deviceId: String(that.devid),
				name: String(that.getvar)
			};

			if (that.productIdOrSlug) options.product = that.productIdOrSlug;

			var vaPr = that.pcloud.particleJS.getVariable(options);
			vaPr
				.then(data => {
					if (data.statusCode == 200) {
						that.trace('Variable retrieved successfully');
						let msg = {
							raw: data.body,
							payload: data.body.result,
							id: data.body.coreInfo.deviceID
						};
						that.send(msg);
					}
				})
				.catch(err => {
					that.error(err.body.error, err.body);
				});
		});

		this.on('close', (removed, done) => {
			if (that.interval_id) {
				that.trace('Interval closed.');
				clearInterval(that.interval_id);
			}

			if (done) done();
		});
	}
	// register ParticleVar node
	RED.nodes.registerType('particle-var', ParticleVar);
	// end ParticleVar
};

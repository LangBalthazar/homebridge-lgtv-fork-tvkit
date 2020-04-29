var lgtv = require("lgtv-2012").lgtv;
var ping = require("ping");
var inherits = require("util").inherits;
var Service, Characteristic;

// Configure TV
function LGTV2012(log, config) {
  this.log = log;
  this.powered = false;

  if (config) {
    this.name = config.name;
    this.host = config.ip;
    this.key = config.pairingKey;
    this.port = parseInt(config.port) || 8080;
    this.on_command = String(config.on_command).toUpperCase() || "MUTE";
    this.debug = config.debug === true || config.debug == "true";
    this.false_run = config.false_run === true || config.false_run == "true";
  } else {
    this.log("No configuration found. Please add configuration in config.json");
    return;
  }
}

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-lgtv-fork-tvkit", "lgtv-2012-fork-tvkit", LGTV2012);
};

LGTV2012.prototype.getServices = function() {
  var services = [];
  // this.tv = new PanasonicCommands(this.HOST);
  this.tv = new lgtv({ host: this.host, port: this.port });
  this.tv.debug = this.debug;
  this.tv.false_run = this.false_run;

  // Configure HomeKit TV Device Information
  this.deviceInformation = new Service.AccessoryInformation();

  this.deviceInformation
    .setCharacteristic(Characteristic.Name, "LG TV 2012")
    .setCharacteristic(Characteristic.Manufacturer, "LG Electronics Inc.")
    .setCharacteristic(Characteristic.Model, "1.0")
    .setCharacteristic(Characteristic.SerialNumber, "Unknown");

  // Configure HomeKit TV Accessory
  this.tvService = new Service.Television(this.name, "Television");
  this.tvService
    .setCharacteristic(Characteristic.ConfiguredName, this.name)
    .setCharacteristic(Characteristic.SleepDiscoveryMode, 1);

  this.tvService
    .getCharacteristic(Characteristic.Active)
    .on("get", this.getOn.bind(this))
    .on("set", this.setOn.bind(this));

  // Configure HomeKit TV Accessory Remote Control
  this.tvService
    .getCharacteristic(Characteristic.RemoteKey)
    .on("set", this.remoteControl.bind(this));

  // Configure HomeKit TV Volume Control
  this.speakerService = new Service.TelevisionSpeaker(
    this.name + " Speaker",
    "volumeService"
  );

  this.speakerService
    .setCharacteristic(Characteristic.Name, this.name + " Speaker")
    .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
    .setCharacteristic(
      Characteristic.VolumeControlType,
      Characteristic.VolumeControlType.ABSOLUTE
    );

  this.speakerService
    .getCharacteristic(Characteristic.VolumeSelector)
    .on("set", (newValue, callback) => {
      // this.tv.setVolume(newValue);
      this.log("VolumeSelector Set: " + newValue);
      callback(null, newValue);
    });

  this.speakerService
    .getCharacteristic(Characteristic.Mute)
    .on("get", this.getMute.bind(this))
    .on("set", this.setMute.bind(this));

  this.speakerService
    .addCharacteristic(Characteristic.Volume)
    .on("get", this.getVolume.bind(this))
    .on("set", this.setVolume.bind(this));

  this.tvService.addLinkedService(this.speakerService);

  services.push(this.deviceInformation, this.tvService, this.speakerService);

  this.log("Initialization complete.");
  return services;
};

LGTV2012.prototype.connect = function(cb) {
  if (this.host && this.host.length && this.port) {
    this.tv.new_session(this.key, tv => {
      this.powered = Boolean(tv);
      cb(tv);
    });
  } else {
    this.log("Does not appear to be powered on");
    this.powered = false;
    cb(null);
  }
};

// TV Speaker
LGTV2012.prototype.getMute = function(callback) {
  this.connect(tv => {
    tv.get_volume(volume => {
      this.log("Mute status: " + volume.mute);
      callback(null, volume.mute);
    });
  });
};

LGTV2012.prototype.setMute = function(value, callback) {
  this.connect(tv => {
    tv.send_command("MUTE");
    callback(null, !value);
  });
};

LGTV2012.prototype.getVolume = function(callback) {
  this.connect(tv => {
    tv.get_volume(volume => {
      this.log("Volume level: " + volume.level);
      callback(null, volume.level);
    });
  });
};

LGTV2012.prototype.setVolume = function(value, callback) {
  this.connect(tv => {
    tv.set_volume(value, err => {
      this.log(
        "Setting Volume to " + to + "... " + err ? "Success" : "Failure"
      );
      callback(null, value);
    });
  });
};

// TV Remote Control
LGTV2012.prototype.remoteControl = function(action, callback) {
  this.log("Remote Control Action: " + action);
  this.connect(tv => {
    switch (action) {
      case 0: // Rewind
        tv.send_command("REWIND");
        break;
      case 1: // Fast Forward
        tv.send_command("FF");
        break;
      case 2: // Next Track
        tv.send_command("SKIP_FORWARD");
        break;
      case 3: // Previous Track
        tv.send_command("SKIP_BACKWARD");
        break;
      case 4: // Up Arrow
        tv.send_command("UP");
        break;
      case 5: // Down Arrow
        tv.send_command("DOWN");
        break;
      case 6: // Left Arrow
        tv.send_command("LEFT");
        break;
      case 7: // Right Arrow
        tv.send_command("RIGHT");
        break;
      case 8: // Select
        tv.send_command("ENTER");
        break;
      case 9: // Back
        tv.send_command("BACK");
        break;
      case 10: // Exit
        tv.send_command("EXIT");
        break;
      case 11: // Play / Pause
        tv.send_command("PLAY");
        break;
      case 15: // Information
        tv.send_command("INFO");
        break;
    }

    callback(null, action);
  });
};

// TV Power
LGTV2012.prototype.getOn = function(callback) {
  if (!this.host || !this.host.length) callback(null, false);
  else
    ping.sys.probe(
      this.host,
      isAlive => {
        this.powered = isAlive;
        this.log(" is" + isAlive ? "On" : "Off");
        callback(null, isAlive);
      },
      { timeout: 1, min_reply: 1 }
    );
};

LGTV2012.prototype.setOn = function(toggle, callback) {
  if (!this.powered || this.tv.locked) {
    this.log("Unable to change power settings at this time");
    callback(null, false);
  } else {
    this.getOn((error, alive) => {
      this.connect(tv => {
        this.log("Turning " + toggle ? "On" : "Off");
        if (toggle) {
          tv.send_command(this.on_command, err => {
            callback(null, true);
          });
        } else {
          tv.send_command("POWER", err => {
            callback(null, true);
          });
        }
      });
    });
  }
};

LGTV2012.prototype.identify = function(cb) {
  if (this.host && this.host.length) {
    if (this.powered) {
      if (this.key && this.key.length)
        this.connect(tv => {
          tv.send_command("APPS", success => {
            this.log("Identifying by launching LG App menu");
            cb(null, success);
          });
        });
      else
        tv.pair_request(success => {
          this.log("Performing request for TV key");
          cb(null, success);
        });
    } else
      this.checkInterval(alive => {
        cb(null, alive);
      });
  } else cb(null, false);
};

LGTV2012.prototype.checkInterval = function(cb) {
  this.getOn((err, state) => {
    cb(state);
  });
  //setTimeout(cb, this.checkInterval.bind(this, cb), 2000)
};

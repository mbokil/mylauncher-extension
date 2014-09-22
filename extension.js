// This extension was developed by :
// * Mark Bokil http://markbokil.com
// * http://markbokil.com/downloads/extensions/mylauncher
// version: 1.0.1
// date: 9-1-12
// License: GPLv2+
// Copyright (C) 2012-2013 M D Bokil

/*jslint esnext:true */
/*global imports */

const Version = "1.0.1";
const ModalDialog = imports.ui.modalDialog;
const Gio = imports.gi.Gio; // file monitor
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Shell = imports.gi.Shell;

const Gettext = imports.gettext.domain('markbokil.com-extensions');
const _ = Gettext.gettext;
const _N = function(x) { return x; };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Keys = Me.imports.keys;

const PropertiesFile = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com/mylauncher.properties']);
const SettingsJSON = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com/settings.js']);
const AppDir = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com']);
const HelpURL = "http://markbokil.com/downloads/extensions/mylauncher/help.php?appname=mylauncher&version=" + Version;
const AboutURL = "http://markbokil.com/downloads/extensions/mylauncher/about.php?appname=mylauncher&version=" + Version;

const DEBUG = false;
const PREFS_DIALOG = 'gnome-shell-extension-prefs mylauncher@markbokil.com';

function debug(str) {
    if (DEBUG) {
        str = "[ MyLauncher ]--------> " + str;
        global.log(str);
    }
}


const MyPopupMenuItem = new Lang.Class({
    Name: 'MyLauncher.MyPopupMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,
    
    _init: function(gicon, text, params) {
        this.parent(params);
        
        this.box = new St.BoxLayout({ style_class: 'popup-combobox-item' });
        
        if (gicon) {
            this.icon = new St.Icon({
                gicon: gicon,
                style_class: 'system-status-icon'
            });
        } else {
            this.icon = new St.Icon({
                icon_name: 'edit-clear',
                icon_size: 22
            });
        }
        
        this.box.add(this.icon);
        this.label = new St.Label({ text: text });
        this.box.add(this.label);
        this.actor.add(this.box);
    }
});


const MyLauncher = new Lang.Class({
    Name: 'MyLauncher.MyLauncher',
    Extends: PanelMenu.Button,
    
    _init: function() {
        this.parent(St.Align.START);
        
        this._settings = Convenience.getSettings();
        this.menuIcons = this._settings.get_boolean(Keys.MENU_ICONS);     

        debug('menuIcons ' + this.menuIcons );

        //legacy apps properties, todo
        this._json = {
            toolTips: false,
            icon: "mylauncher.svg",
            OpenFileCmd: "xdg-open"
        };

        //set icon svg or symbolic
        if (this._json.icon.indexOf(".") != -1) {
            this._iconActor = new St.Icon({
                icon_size: Main.panel.actor.height,
                icon_name: 'mylauncher',
                style_class: 'appIcon'
            }); //image icon
        } else {
            this._iconActor = new St.Icon({
                icon_name: this._json.icon,
                style_class: 'system-status-icon'
            }); //symbolic icon
        }
        
        this.actor.add_actor(this._iconActor); 
        this.actor.add_style_class_name("appPanelBtn");
        
        // watch props file for changes
        let file = Gio.file_new_for_path(PropertiesFile);
        this._monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', Lang.bind(this, this._on_file_changed));
            
        // get mylauncher.properties data
        this._propLines = this._getProperties();  

        this._createMenu();
        
        Main.panel.addToStatusArea("MyLauncher", this);
        Main.panel.menuManager.addMenu(this.menu);
        
        this._settingsSignals = [];
        this._settingsSignals.push(
            this._settings.connect('changed::' + Keys.MENU_ICONS,
                                   Lang.bind(this, this._setMenuIcons)));
    },

    destroy: function () {
        Main.panel.menuManager.removeMenu(this.menu);
        Main.panel._rightBox.remove_actor(this.actor);

        // disconnect settings bindings 
        for (x=0; x < this._settingsSignals.length; x++)
            global.screen.disconnect(this._settingsSignals[x]);

        this._settingsSignals = [];
        this._settingsSignals = null;

        this.parent();
    },

    _onButtonPress: function(actor, event) {
            let button = event.get_button();
            if (button == 1) {
                this._doRefresh(); //rebuild launcher menu
            } else if (button == 3) {
                this.menu.removeAll();
                this._createContextMenu(); //build context menu
            }
       
        return PanelMenu.Button.prototype._onButtonPress.call(this, actor, event);
    },
    
    // build dynamic menu items
    _createMenu: function () {

        // flags for executable type
        //lg=looking glass, rt=reload theme, rg=restart gnome, sc=shell command
        var lg,rt,rg,sc;

        for (let i = 0; i < this._propLines.length; i++) {
            let line = this._propLines[i];
            if (line.substring(0,1) == '#')
                continue;
            if (line.trim(' ') == '')
                continue;
            if (line.indexOf('---') != -1 || line.indexOf('[MS]') != -1) { // '---' is legacy support
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem()); // draw seperator
                continue;
            }  
                   
            let prop = line.split(/=(.*)/); //split only first = char
            if (prop.length < 2) continue;
            
            let propName = prop[0].trim(' ');
            let propVal =  prop[1].trim(' '); 
            
            //lg=looking glass, rt=reload theme, rg=restart shell, sc=shell command
            lg = false;
            rt = false;
            rg = false;
            sc = false;
                      
            // setup menu icons if enabled
            let gicon = Gio.icon_new_for_string("emblem-system-symbolic"); //executable
            if (this.menuIcons) {
                if (propVal.indexOf('xdg-open') != -1) { //link or folder
                    if (propVal.indexOf('http') != -1 || propVal.indexOf('ftp') != -1) {
                        gicon = Gio.icon_new_for_string("starred-symbolic");
                    } else {
                        gicon = Gio.icon_new_for_string("folder-symbolic");
                    }
                } else if (propVal.indexOf('sh ') != -1) {
                    gicon = Gio.icon_new_for_string("utilities-terminal-symbolic"); //script
                }
            } 

            //determine launcher type
            if (propVal.indexOf('[TD]') != -1) { // toggle desktop  
                propVal = "sh " + AppDir + "/show-desktop.sh";
                sc = true;
            } else if (propVal.indexOf('[LG]') != -1) { //looking glass
                propVal = "Main.createLookingGlass().toggle()";
                lg = true;
            } else if (propVal.indexOf('[RT]') != -1) { //reload theme
                propVal = "Main.loadTheme()";
                rt = true;
            } else if (propVal.indexOf('[RG]') != -1) { //restart Shell
                propVal = "global.reexec_self()";
                rg = true;
            } else if (propVal.indexOf('[MC]') != -1) { //minecraft launcher 
                propVal = "sh " + AppDir + "/run-minecraft.sh";
                sc = true;
            } else if (propVal.indexOf('[CH]') != -1) { //clear history
                propVal = "sh " + AppDir + "/clear-history.sh";
                sc = true;
            } else if (propVal.indexOf('[EE]') != -1) { // ?
                propVal = "xdg-open http://markbokil.com/downloads/extensions/mylauncher/mycat.jpg";
                sc = true;
            } else {
                sc = true; //assume everything else is shell command
            }
        
            //add icons if on or use plain menuitem
            if (this.menuIcons) {
                this.item = new MyPopupMenuItem(gicon, propName, {});
            } else {
                this.item = new PopupMenu.PopupMenuItem(propName);
            }

            // Tooltips Gnome shell compatible?
              // if (this._json.toolTips) {
              //     this.item.actor.tooltip_text = propVal;
              // }

            if (lg) {
                this.item.connect('activate', Lang.bind(this, function() { Main.createLookingGlass().toggle(); } ));  
            } 
            else if (rg) {
                this.item.connect('activate', Lang.bind(this, function() { global.reexec_self(); } ));
            }
            else if (rt) {
                this.item.connect('activate', Lang.bind(this, function() { Main.loadTheme(); } ));
            } 
            else if (sc) {
                this.item.connect('activate', Lang.bind(this, function() { this._runCmd(propVal); } ));
            }
            this.menu.addMenuItem(this.item);
        }
    },

    _createContextMenu: function () {   
        this.edit = new PopupMenu.PopupMenuItem("Edit Menu");
        this.menu.addMenuItem(this.edit);
        this.edit.connect('activate', Lang.bind(this, this._editProperties));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem()); //separator

        this.settings = new PopupMenu.PopupMenuItem("Settings");
        this.menu.addMenuItem(this.settings);
        this.settings.connect('activate', Lang.bind(this, this._doPrefsDialog));


        this.help = new PopupMenu.PopupMenuItem("Help");
        this.menu.addMenuItem(this.help);
        this.help.connect('activate', Lang.bind(this, this._doHelp));

        this.about = new PopupMenu.PopupMenuItem("About");
        this.menu.addMenuItem(this.about);
        this.about.connect('activate', Lang.bind(this, this._doAbout));
    },

    _doPrefsDialog: function() {
        debug('in doprefsdialog: ');
        Main.Util.trySpawnCommandLine(PREFS_DIALOG);
            
    },

    _on_file_changed: function() {
        // get altered mylauncher.properties data
        this._propLines = this._getProperties();
        if (this._propLines) {
            this._doRefresh();
        }
    },

    _getProperties: function () {
        let prop = Shell.get_file_contents_utf8_sync(PropertiesFile);
        if (prop) {
            let lines = prop.split('\n');

            return lines;
        } else {
            Main.notify("mylauncher.properties file could not be read");
            return null;
        }
    },

    _editProperties: function () {
        Main.Util.spawnCommandLine(this._json.OpenFileCmd + " " + PropertiesFile);
    },
        
    _doRefresh: function () {
        this.menu.removeAll();
        this._createMenu();
    },
    
    _doHelp: function () {
        Main.Util.spawnCommandLine(this._json.OpenFileCmd + " " + HelpURL);
    },
    
    _doAbout: function () {
        Main.Util.spawnCommandLine(this._json.OpenFileCmd + " " + AboutURL);
    },

    _runCmd: function(propVal) {
        if (propVal == '') {
            Main.notify("No command was found to run.");
            return;
        }

        let cmds;
        if (propVal.indexOf(';') != -1) { // multi-line commands split by ';'
            cmds = propVal.split(';');
        } else {
            cmds = new Array(propVal);
        }

        for (let x = 0; x < cmds.length; x++) {
            try {
                Main.Util.trySpawnCommandLine(cmds[x]);
                if (cmds[x].indexOf('clear-history.sh') != -1) {
                    Main.notify("Recent files history was cleared.");
                }

            } catch(e) {
                global.log(e.toString());
            }
        }
    },

    _setMenuIcons: function() {
        this.menuIcons = this._settings.get_boolean(Keys.MENU_ICONS);
    }
});
    


let _indicator;

function init(metadata) 
{
    Convenience.initTranslations();
}


function enable() {
    debug("Enabling");
    
    _indicator = new MyLauncher();
}

function disable() {
    if(_indicator) {
        debug("Disabling");
        
        _indicator.destroy();
        _indicator = null;
    }
}

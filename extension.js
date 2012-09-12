// This extension was developed by :
// * Mark Bokil http://markbokil.com
// * http://markbokil.com/downloads/extensions/mylauncher
// version: 1.0.1 BETA
// date: 9-1-12
// License: GPLv2+
// Copyright (C) 2012-2013 M D Bokil

const Version = "1.0.1";
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog;
const Util = imports.misc.util;
const Main = imports.ui.main;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio; // file monitor
const Shell = imports.gi.Shell;
const Gettext = imports.gettext;
const ExtensionUtils = imports.misc.extensionUtils; 
const _ = Gettext.domain('mylauncher').gettext;


const PropertiesFile = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com/mylauncher.properties']);
const SettingsJSON = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com/settings.js']);
const AppDir = GLib.build_filenamev([global.userdatadir, 'extensions/mylauncher@markbokil.com']);
const HelpURL = "http://markbokil.com/downloads/extensions/mylauncher/help.php?appname=mylauncher&version=" + Version;
const AboutURL = "http://markbokil.com/downloads/extensions/mylauncher/about.php?appname=mylauncher&version=" + Version;


function MyLauncher(metadata)
{   
    let locales = metadata.path + "/locale";
    Gettext.bindtextdomain('mylauncher', locales);

    this._init();
}

function MyPopupMenuItem()
{
  this._init.apply(this, arguments);
}

MyPopupMenuItem.prototype =
{
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,
    _init: function(gicon, text, params)
    {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        this.box = new St.BoxLayout({ style_class: 'popup-combobox-item' });
        if (gicon)
          this.icon = new St.Icon({ gicon: gicon, style_class: 'popup-menu-icon' });
        else
          this.icon = new St.Icon({ icon_name: 'edit-clear', icon_type: St.IconType.SYMBOLIC, icon_size: 22 });
        this.box.add(this.icon);
        this.label = new St.Label({ text: text });
        this.box.add(this.label);
        this.addActor(this.box);
    }
}

// Prototype
MyLauncher.prototype =
{
    __proto__: PanelMenu.Button.prototype,
    
    _init: function(gicon) {        
        PanelMenu.Button.prototype._init.call(this, St.Align.START);

        this._json = this._getAppSettings(); //load app settings from JSON file
            
        // safe fallback settings if json data file missing
        if (!this._json) {
            this._json = {"toolTips":false,"icon":"mylauncher.svg","OpenFileCmd":"xdg-open","menuIcons":true};
            Main.notify("Settings.js file could not be read.");
        }

        //set icon svg or symbolic
        if (this._json.icon.indexOf(".") != -1) {
            this._iconActor = new St.Icon({ icon_size: Main.panel.actor.height, 
                                        icon_name: 'mylauncher',
                                        icon_type: St.IconType.SYMBOLIC,
                                        style_class: 'appIcon' });
        } else {
            this._iconActor = new St.Icon({ icon_name: this._json.icon,
                                        icon_type: St.IconType.SYMBOLIC,
                                        style_class: 'system-status-icon' });
        }

        this.actor.add_actor(this._iconActor); 
        this._iconActor.get_parent().add_style_class_name("panelButtonWidth");

        // watch props file for changes
        let file = Gio.file_new_for_path(PropertiesFile);
        this._monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', Lang.bind(this, this._on_file_changed));
            
        // get mylauncher.properties data
        this._propLines = this._getProperties();  

        this._createMenu();
        //this.actor.connect('button-release-event', Lang.bind(this, this._getRightClick));
        
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
            if (this._json.menuIcons) {
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
            if (this._json.menuIcons) {
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

        this.help = new PopupMenu.PopupMenuItem("Help");
        this.menu.addMenuItem(this.help);
        this.help.connect('activate', Lang.bind(this, this._doHelp));

        this.about = new PopupMenu.PopupMenuItem("About");
        this.menu.addMenuItem(this.about);
        this.about.connect('activate', Lang.bind(this, this._doAbout));
    },

    _getAppSettings: function () {
        try {
            let prop = Shell.get_file_contents_utf8_sync(SettingsJSON);
            let json = JSON.parse(prop);
            return json;
        } catch(e) {
            global.logError(e);
            return false;
        }
    },

    _setAppSettings: function () {
        try {
            let f = Gio.file_new_for_path(SettingsJSON);
            let raw = f.replace(null, false,
                            Gio.FileCreateFlags.NONE,
                            null);
            let out = Gio.BufferedOutputStream.new_sized (raw, 4096);
            Shell.write_string_to_stream(out, JSON.stringify(this.json));
            out.close(null);
        } catch(e) {
            Main.notify("MyLauncher settings could not be saved.");
            global.logError(e);
        }
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
        var cmds;
        if (propVal.indexOf(';') != -1) { // multiline commands split by ';'
            cmds = propVal.split(';');
        } else {
            cmds = new Array(propVal);
        }

        for (x=0; x < cmds.length; x++) {
            try {
                Util.spawnCommandLine(cmds[x]);
            } catch(e) {
                global.logError(e);
            }
        }
    },

    enable: function()
    {
        Main.panel._rightBox.insert_child_at_index(this.actor, 0);
        Main.panel._menus.addMenu(this.menu);
    },

    disable: function()
    {
        Main.panel._menus.removeMenu(this.menu);
        Main.panel._rightBox.remove_actor(this.actor);
    }
}
    

// Init function
function init(metadata) 
{       
    return new MyLauncher(metadata);
}

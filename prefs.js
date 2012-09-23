const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const St = imports.gi.St;
const Lang = imports.lang;
const Gettext = imports.gettext.domain('markbokil.com-extensions;');
const _ = Gettext.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Keys = Me.imports.keys;

const _N = function(x) { return x; }

const MENU_ICONS = _N("Menu Icons");


function init() {
    Convenience.initTranslations();
}

function MyLauncherSettingsWidget() {
    this._init();
}

MyLauncherSettingsWidget.prototype = {

    _init: function() {
        this._grid = new Gtk.Grid();
        this._grid.margin = this._grid.row_spacing = this._grid.column_spacing = 10;
	    this._settings = Convenience.getSettings();

        //overview switch
        this._grid.attach(new Gtk.Label({ label: _(MENU_ICONS), wrap: true, xalign: 0.0 }), 0,  0, 1, 1);
        let menuIconsSwitch = new Gtk.Switch({active: this._settings.get_boolean(Keys.MENU_ICONS)});
        this._grid.attach(menuIconsSwitch, 4, 0, 1, 1);

        menuIconsSwitch.connect('notify::active', Lang.bind(this, this._setMenuIcons));

    },

    _setMenuIcons: function(object) {
        this._settings.set_boolean(Keys.MENU_ICONS, object.active);
    },

    _resetSettings: function() {
        this._settings.set_boolean(Keys.OVERVIEW_MODE, false);
    },

    _completePrefsWidget: function() {
        let scollingWindow = new Gtk.ScrolledWindow({
                                 'hscrollbar-policy': Gtk.PolicyType.AUTOMATIC,
                                 'vscrollbar-policy': Gtk.PolicyType.AUTOMATIC,
                                 'hexpand': true, 'vexpand': true});
        scollingWindow.add_with_viewport(this._grid);
        scollingWindow.show_all();
        return scollingWindow;
    }
};

function buildPrefsWidget() {
    let widget = new MyLauncherSettingsWidget();
    return widget._completePrefsWidget();
}

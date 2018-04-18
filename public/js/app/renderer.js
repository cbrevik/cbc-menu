import calcBeerList from './calc_beer_list'
import _ from 'underscore'
import EventEmitter from 'events'
export default class Renderer extends EventEmitter {
  constructor(app, templates, view) {
    super();
    this.app = app;
    this.templates = templates;
    this.view = view;
    this.globals = {}; 
  }

  canRender(viewName) {
    return !!this[`renderer_${viewName}`];
  }

  render(viewName, opts) {
    Object.assign(opts, this.globals);
    opts.tset = createLinkToSetParam(opts);
    const html = this[`renderer_${viewName}`](opts);
    if (html) this.view.empty().html(html);
    this.emit('didRender');
  }

  renderer_session(opts) {
    if (!opts.colour) return;

    const {breweries, beer_count} = calcBeerList(this.app.beerset, opts);
    opts.breweries = breweries;
    opts.beer_count = beer_count;
    opts.typeclass = opts.title = `${opts.colour} session`;
    opts.rating_as_percent = function() { return this.rating / 5 * 100 };
    return Mustache.render(this.templates.beerlist, opts);
  }

  renderer_beerlist(opts) {
    calcBeerList(opts);
    opts.typeclass = 'beer-list';
    opts.title = 'All Beers';
    opts.rating_as_percent = function() { return this.rating / 5 * 100 };
    return Mustache.render(this.templates.beerlist, opts);
  }

  renderer_index(opts) {
    if (this.app.db.msg) {
      opts.msg = this.app.db.msg;
      this.app.db.msg = null;
    }
    opts.untappd_redir_url = this.app.config.UT_REDIR_URL;
    opts.untappd_cid = this.app.config.UT_CLIENT;
    return Mustache.render(this.templates.index, opts);
  }

  renderer_toggle_live_ratings() {
    this.app.toggleLiveRatings();
    window.location = '/#index';
  }

  async renderer_access_token(opts) {
    try {
      await this.app.saveUntappdToken(opts);
    } catch (e) {
      this.app.db.msg = 'Untappd authentication failed 😨';
    } finally {
      window.location = '/#index';
    }
  }

  async renderer_unicorn() {
    this.showLoading();
    try { 
      const count = await this.app.downloadUserUntappdCheckins();
      db.msg = `Marked ${count} beers as checked-in on untappd`;
    } catch (e) {
      db.msg = e.message;
    } finally {
      window.location = '/#index';
    }
  }

  async renderer_snapshot() {
    this.showLoading();
    try {
      await this.app.takeSnapshot();
      db.msg = 'Snapshot saved!';
    } catch (e) {
      db.msg = 'Snapshot failed 😱 - ' + err.message;
    } finally {
      window.location = '/#index';
    }
  }

  async renderer_loadsnapshot() {
    if (!confirm("Load snapshot? This will overwrite any existing stars/checks/ratings with data from the snapshot")) {
      window.location = '/#index';
      return;
    }
    this.showLoading();
    try {
      await this.app.loadSnapshot();
    } catch (e) {
      db.msg =  `Couldn't load snapshot 😱 - ${err.message}`;
      window.location = '/#index';
    } 
  }

  renderer_ut_logout() {
    this.app.db.untappdUser = null;
    this.app.db.untappdToken = null;
    window.location = '/#index';
  }

  renderer_load(opts) {
    if (!opts.data) return this.renderer_index(opts);
    this.app.db.savedBeers = _.compact(opts.data.saved.split(','));
    this.app.db.tastedBeers = _.compact(opts.data.tasted.split(','));
    this.app.updateBeersMarked();
    this.app.db.msg = `${this.app.db.savedBeers.length} saved,
      ${this.app.db.tastedBeers.length} tasted beers loaded`;
    location.hash = '/#index';
  }

  renderer_loadb(opts) {
    if (!opts.d) return this.renderer_index(opts);
    this.app.importSnapshotFromString(opts.d)
    window.location = '/#index';
  }

  showLoading() {
    if (!this._loadingTemplate) this._loadingTemplate = Mustache.render(this.templates.loading);
    this.view.empty().html(_loadingTemplate);
  }
}

const createLinkToSetParam = (opts) => {
  return function() {
    return function(val, render) {
      val = render(val);
      var updates = val.split(',');
      var settings = {
        colour: opts.colour,
        metastyle: opts.metastyle,
        order: opts.order,
        tasted: opts.tasted,
        saved: opts.saved,
        today: opts.today,
        mini: opts.mini
      };
      updates = updates.reduce(function(u, update) {
        var kv = update.split('=');
        var key = kv[0].trim();
        var val = kv[1].trim();
        if (val == '!') {
          delete settings[key];
          return u;
        } else if (val.match(/!\w+/)) {
          settings[key] = !settings[key];
          return u;
        }
        u[key] = val;
        return u;
      }, {});
      return '#' + opts.page + '[' + JSON.stringify(_.extend(settings,updates)).replace(/"/g, "&quot;") + ']';
    }
  };
}

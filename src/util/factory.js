const d3 = require('d3');
const Tabletop = require('tabletop');
const _ = {
    map: require('lodash/map'),
    uniqBy: require('lodash/uniqBy'),
    capitalize: require('lodash/capitalize'),
    each: require('lodash/each')
};

const InputSanitizer = require('./inputSanitizer');
const Radar = require('../models/radar');
const Quadrant = require('../models/quadrant');
const Ring = require('../models/ring');
const Blip = require('../models/blip');
const GraphingRadar = require('../graphing/radar');
const MalformedDataError = require('../exceptions/malformedDataError');
const SheetNotFoundError = require('../exceptions/sheetNotFoundError');
const ContentValidator = require('./contentValidator');
const Sheet = require('./sheet');
const ExceptionMessages = require('./exceptionMessages');
const radarJson = require('../../lib/radar.json')

const plotRadar = function (title, blips) {
    document.title = title;
    d3.selectAll(".loading").remove();

    var rings = _.map(_.uniqBy(blips, 'ring'), 'ring');
    var ringMap = {};
    var maxRings = 4;

    _.each(rings, function (ringName, i) {
        if (i == maxRings) {
            throw new MalformedDataError(ExceptionMessages.TOO_MANY_RINGS);
        }
        ringMap[ringName] = new Ring(ringName, i);
    });

    var quadrants = {};
    _.each(blips, function (blip) {
        if (!quadrants[blip.quadrant]) {
            quadrants[blip.quadrant] = new Quadrant(_.capitalize(blip.quadrant));
        }
        quadrants[blip.quadrant].add(new Blip(blip.name, ringMap[blip.ring], blip.isNew.toLowerCase() === 'true', blip.topic, blip.description))
    });

    var radar = new Radar();
    _.each(quadrants, function (quadrant) {
        radar.addQuadrant(quadrant)
    });

    var size = (window.innerHeight - 133) < 620 ? 620 : window.innerHeight - 133;

    new GraphingRadar(size, radar).init().plot();
}

const GoogleSheet = function (sheetReference, sheetName) {
    var self = {};

    self.build = function () {
        var sheet = new Sheet(sheetReference);
        sheet.exists(function(notFound) {
            if (notFound) {
                plotErrorMessage(notFound);
                return;
            }

            Tabletop.init({
                key: sheet.id,
                callback: createBlips
            });
        });

        function createBlips(__, tabletop) {

            try {

                if (!sheetName) {
                    sheetName = tabletop.foundSheetNames[0];
                }
                var columnNames = tabletop.sheets(sheetName).columnNames;

                var contentValidator = new ContentValidator(columnNames);
                contentValidator.verifyContent();
                contentValidator.verifyHeaders();

                var all = tabletop.sheets(sheetName).all();
                var blips = _.map(all, new InputSanitizer().sanitize);

                plotRadar(tabletop.googleSheetName, blips);
            } catch (exception) {
                plotErrorMessage(exception);
            }
        }
    };

    self.init = function () {
        plotLoading();
        return self;
    };

    return self;
};

const JSONDocument = function () {
    var self = {};

    self.build = function () {
      createBlips(radarJson);
    }

    var createBlips = function (data) {
        try {
            var columnNames = Object.keys(data[0]);
            var contentValidator = new ContentValidator(columnNames);
            contentValidator.verifyContent();
            contentValidator.verifyHeaders();
            var blips = _.map(data, new InputSanitizer().sanitize);
            plotRadar('Vermonster Tech Radar', blips);
        } catch (exception) {
            plotErrorMessage(exception);
        }
    }

    self.init = function () {
        plotLoading();
        return self;
    };

    return self;
};


const FileName = function (url) {
    var search = /([^\/]+)$/;
    var match = search.exec(decodeURIComponent(url.replace(/\+/g, " ")));
    if (match != null) {
        var str = match[1];
        return str;
    }
    return url;
}


const RadarInput = function () {
    var self = {};

    self.build = function () {
      if (process.env.GOOGLE_SHEET_ID) {
        var input = GoogleSheet(process.env.GOOGLE_SHEET_ID, null);
      } else {
        var input = JSONDocument();
      }
      input.init().build();
    };

    return self;
};

function set_document_title() {
    document.title = "Vermonster Technology Radar";
}

function plotLoading(content) {
    var content = d3.select('body')
        .append('div')
        .attr('class', 'loading')
        .append('div')
        .attr('class', 'input-sheet');

    set_document_title();

    plotLogo(content);

    var bannerText = '<h1>Loading</h1>';
    plotBanner(content, bannerText);
    plotFooter(content);
}

function plotLogo(content) {
    content.append('div')
        .attr('class', 'input-sheet__logo')
        .html('<a href="https://www.vermonster.com"><img src="/images/vermonster-logo.png" / ></a>');
}

function plotFooter(content) {
    content
        .append('div')
        .attr('id', 'footer')
        .append('div')
        .attr('class', 'footer-content')
        .append('p')
        .html('Powered by <a href="https://www.thoughtworks.com"> ThoughtWorks</a>. '
        + 'By using this service you agree to <a href="https://info.thoughtworks.com/visualize-your-tech-strategy-terms-of-service.html">ThoughtWorks\' terms of use</a>. '
        + 'You also agree to our <a href="https://www.thoughtworks.com/privacy-policy">privacy policy</a>, which describes how we will gather, use and protect any personal data contained in your public Google Sheet. '
        + 'This software is <a href="https://github.com/thoughtworks/build-your-own-radar">open source</a> and available for download and self-hosting.');
}

function plotBanner(content, text) {
    content.append('div')
        .attr('class', 'input-sheet__banner')
        .html(text);

}

function plotErrorMessage(exception) {
    d3.selectAll(".loading").remove();
    var message = 'Oops! It seems like there are some problems with loading your data. ';

    if (exception instanceof MalformedDataError) {
        message = message.concat(exception.message);
    } else if (exception instanceof SheetNotFoundError) {
        message = exception.message;
    } else {
        console.error(exception);
    }

    message = message.concat('<br/>', 'Please check <a href="https://info.thoughtworks.com/visualize-your-tech-strategy-guide.html#faq">FAQs</a> for possible solutions.');

    d3.select('body')
        .append('div')
        .attr('class', 'error-container')
        .append('div')
        .attr('class', 'error-container__message')
        .append('p')
        .html(message);
}

module.exports = RadarInput;

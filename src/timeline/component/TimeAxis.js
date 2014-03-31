/**
 * A horizontal time axis
 * @param {Component} parent
 * @param {Component[]} [depends]   Components on which this components depends
 *                                  (except for the parent)
 * @param {Object} [options]        See TimeAxis.setOptions for the available
 *                                  options.
 * @constructor TimeAxis
 * @extends Component
 */
function TimeAxis (parent, depends, options) {
  this.id = util.randomUUID();
  this.parent = parent;
  this.depends = depends;

  this.dom = {
    majorLines: [],
    majorTexts: [],
    minorLines: [],
    minorTexts: [],
    redundant: {
      majorLines: [],
      majorTexts: [],
      minorLines: [],
      minorTexts: []
    }
  };
  this.props = {
    range: {
      start: 0,
      end: 0,
      minimumStep: 0
    },
    lineTop: 0
  };

  this.options = options || {};
  this.defaultOptions = {
    orientation: 'bottom',  // supported: 'top', 'bottom'
    // TODO: implement timeaxis orientations 'left' and 'right'
    showMinorLabels: true,
    showMajorLabels: true
  };

  this.conversion = null;
  this.range = null;
}

TimeAxis.prototype = new Component();

// TODO: comment options
TimeAxis.prototype.setOptions = Component.prototype.setOptions;

/**
 * Set a range (start and end)
 * @param {Range | Object} range  A Range or an object containing start and end.
 */
TimeAxis.prototype.setRange = function (range) {
  if (!(range instanceof Range) && (!range || !range.start || !range.end)) {
    throw new TypeError('Range must be an instance of Range, ' +
        'or an object containing start and end.');
  }
  this.range = range;
};

/**
 * Convert a position on screen (pixels) to a datetime
 * @param {int}     x    Position on the screen in pixels
 * @return {Date}   time The datetime the corresponds with given position x
 */
TimeAxis.prototype.toTime = function(x) {
  var conversion = this.conversion;
  return new Date(x / conversion.scale + conversion.offset);
};

/**
 * Convert a datetime (Date object) into a position on the screen
 * @param {Date}   time A date
 * @return {int}   x    The position on the screen in pixels which corresponds
 *                      with the given date.
 * @private
 */
TimeAxis.prototype.toScreen = function(time) {
  var conversion = this.conversion;
  return (time.valueOf() - conversion.offset) * conversion.scale;
};

/**
 * Repaint the component
 * @return {Boolean} changed
 */
TimeAxis.prototype.repaint = function () {
  var asSize = util.option.asSize,
      options = this.options,
      props = this.props;

  var frame = this.frame;
  if (!frame) {
    frame = document.createElement('div');
    this.frame = frame;
  }
  frame.className = 'axis';
  // TODO: custom className?

  // update its size
  this.width = frame.offsetWidth; // TODO: only update the width when the frame is resized

  if (!frame.parentNode) {
    if (!this.parent) {
      throw new Error('Cannot repaint time axis: no parent attached');
    }
    var parentContainer = this.parent.getContainer();
    if (!parentContainer) {
      throw new Error('Cannot repaint time axis: parent has no container element');
    }
    parentContainer.appendChild(frame);
  }

  var parent = frame.parentNode;
  if (parent) {
    // calculate character width and height
    this._calculateCharSize();

    // TODO: recalculate sizes only needed when parent is resized or options is changed
    var orientation = this.getOption('orientation'),
        showMinorLabels = this.getOption('showMinorLabels'),
        showMajorLabels = this.getOption('showMajorLabels');

    // determine the width and height of the elemens for the axis
    var parentHeight = this.parent.height;
    props.minorLabelHeight = showMinorLabels ? props.minorCharHeight : 0;
    props.majorLabelHeight = showMajorLabels ? props.majorCharHeight : 0;
    this.height = props.minorLabelHeight + props.majorLabelHeight;
    props.minorLineHeight = parentHeight + props.minorLabelHeight;
    props.minorLineWidth = 1; // TODO: really calculate width
    props.majorLineHeight = parentHeight + this.height;
    props.majorLineWidth = 1; // TODO: really calculate width

    //  take frame offline while updating (is almost twice as fast)
    var beforeChild = frame.nextSibling;
    parent.removeChild(frame);

    if (orientation == 'top') {
      frame.style.top = '0';
      frame.style.left = '0';
      frame.style.bottom = '';
      frame.style.width = asSize(options.width, '100%');
      frame.style.height = this.height + 'px';
    }
    else { // bottom
      frame.style.top = '';
      frame.style.bottom = '0';
      frame.style.left = '0';
      frame.style.width = asSize(options.width, '100%');
      frame.style.height = this.height + 'px';
    }

    this._repaintLabels();

    this._repaintLine();

    // put frame online again
    if (beforeChild) {
      parent.insertBefore(frame, beforeChild);
    }
    else {
      parent.appendChild(frame)
    }
  }
};

/**
 * Repaint major and minor text labels and vertical grid lines
 * @private
 */
TimeAxis.prototype._repaintLabels = function () {
  var orientation = this.getOption('orientation');

  // calculate range and step
  this._updateConversion();
  var start = util.convert(this.range.start, 'Number'),
      end = util.convert(this.range.end, 'Number'),
      minimumStep = this.toTime((this.props.minorCharWidth || 10) * 5).valueOf()
          -this.toTime(0).valueOf();
  var step = new TimeStep(new Date(start), new Date(end), minimumStep);
  this.step = step;


  // Move all DOM elements to a "redundant" list, where they
  // can be picked for re-use, and clear the lists with lines and texts.
  // At the end of the function _repaintLabels, left over elements will be cleaned up
  var dom = this.dom;
  dom.redundant.majorLines = dom.majorLines;
  dom.redundant.majorTexts = dom.majorTexts;
  dom.redundant.minorLines = dom.minorLines;
  dom.redundant.minorTexts = dom.minorTexts;
  dom.majorLines = [];
  dom.majorTexts = [];
  dom.minorLines = [];
  dom.minorTexts = [];

  step.first();
  var xFirstMajorLabel = undefined;
  var max = 0;
  while (step.hasNext() && max < 1000) {
    max++;
    var cur = step.getCurrent(),
        x = this.toScreen(cur),
        isMajor = step.isMajor();

    // TODO: lines must have a width, such that we can create css backgrounds

    if (this.getOption('showMinorLabels')) {
      this._repaintMinorText(x, step.getLabelMinor(), orientation);
    }

    if (isMajor && this.getOption('showMajorLabels')) {
      if (x > 0) {
        if (xFirstMajorLabel == undefined) {
          xFirstMajorLabel = x;
        }
        this._repaintMajorText(x, step.getLabelMajor(), orientation);
      }
      this._repaintMajorLine(x, orientation);
    }
    else {
      this._repaintMinorLine(x, orientation);
    }

    step.next();
  }

  // create a major label on the left when needed
  if (this.getOption('showMajorLabels')) {
    var leftTime = this.toTime(0),
        leftText = step.getLabelMajor(leftTime),
        widthText = leftText.length * (this.props.majorCharWidth || 10) + 10; // upper bound estimation

    if (xFirstMajorLabel == undefined || widthText < xFirstMajorLabel) {
      this._repaintMajorText(0, leftText, orientation);
    }
  }

  // Cleanup leftover DOM elements from the redundant list
  util.forEach(this.dom.redundant, function (arr) {
    while (arr.length) {
      var elem = arr.pop();
      if (elem && elem.parentNode) {
        elem.parentNode.removeChild(elem);
      }
    }
  });
};

/**
 * Create a minor label for the axis at position x
 * @param {Number} x
 * @param {String} text
 * @param {String} orientation   "top" or "bottom" (default)
 * @private
 */
TimeAxis.prototype._repaintMinorText = function (x, text, orientation) {
  // reuse redundant label
  var label = this.dom.redundant.minorTexts.shift();

  if (!label) {
    // create new label
    var content = document.createTextNode('');
    label = document.createElement('div');
    label.appendChild(content);
    label.className = 'text minor';
    this.frame.appendChild(label);
  }
  this.dom.minorTexts.push(label);

  label.childNodes[0].nodeValue = text;

  if (orientation == 'top') {
    label.style.top = this.props.minorLabelHeight + 'px';
    label.style.bottom = '';
  }
  else {
    label.style.top = '';
    label.style.bottom = this.props.minorLabelHeight + 'px';
  }
  label.style.left = x + 'px';
  //label.title = title;  // TODO: this is a heavy operation
};

/**
 * Create a Major label for the axis at position x
 * @param {Number} x
 * @param {String} text
 * @param {String} orientation   "top" or "bottom" (default)
 * @private
 */
TimeAxis.prototype._repaintMajorText = function (x, text, orientation) {
  // reuse redundant label
  var label = this.dom.redundant.majorTexts.shift();

  if (!label) {
    // create label
    var content = document.createTextNode(text);
    label = document.createElement('div');
    label.className = 'text major';
    label.appendChild(content);
    this.frame.appendChild(label);
  }
  this.dom.majorTexts.push(label);

  label.childNodes[0].nodeValue = text;
  //label.title = title; // TODO: this is a heavy operation

  if (orientation == 'top') {
    label.style.top = '0px';
    label.style.bottom = '';
  }
  else {
    label.style.top = '';
    label.style.bottom = '0px';
  }
  label.style.left = x + 'px';
};

/**
 * Create a minor line for the axis at position x
 * @param {Number} x
 * @param {String} orientation   "top" or "bottom" (default)
 * @private
 */
TimeAxis.prototype._repaintMinorLine = function (x, orientation) {
  // reuse redundant line
  var line = this.dom.redundant.minorLines.shift();

  if (!line) {
    // create vertical line
    line = document.createElement('div');
    line.className = 'grid vertical minor';
    this.frame.appendChild(line);
  }
  this.dom.minorLines.push(line);

  var props = this.props;
  if (orientation == 'top') {
    line.style.top = this.props.minorLabelHeight + 'px';
    line.style.bottom = '';
  }
  else {
    line.style.top = '';
    line.style.bottom = this.props.minorLabelHeight + 'px';
  }
  line.style.height = props.minorLineHeight + 'px';
  line.style.left = (x - props.minorLineWidth / 2) + 'px';
};

/**
 * Create a Major line for the axis at position x
 * @param {Number} x
 * @param {String} orientation   "top" or "bottom" (default)
 * @private
 */
TimeAxis.prototype._repaintMajorLine = function (x, orientation) {
  // reuse redundant line
  var line = this.dom.redundant.majorLines.shift();

  if (!line) {
    // create vertical line
    line = document.createElement('DIV');
    line.className = 'grid vertical major';
    this.frame.appendChild(line);
  }
  this.dom.majorLines.push(line);

  var props = this.props;
  if (orientation == 'top') {
    line.style.top = '0px';
    line.style.bottom = '';
  }
  else {
    line.style.top = '';
    line.style.bottom = '0px';
  }
  line.style.left = (x - props.majorLineWidth / 2) + 'px';
  line.style.height = props.majorLineHeight + 'px';
};


/**
 * Repaint the horizontal line for the axis
 * @private
 */
TimeAxis.prototype._repaintLine = function() {
  var line = this.dom.line,
      frame = this.frame,
      orientation = this.getOption('orientation');

  // line before all axis elements
  if (this.getOption('showMinorLabels') || this.getOption('showMajorLabels')) {
    if (line) {
      // put this line at the end of all childs
      frame.removeChild(line);
      frame.appendChild(line);
    }
    else {
      // create the axis line
      line = document.createElement('div');
      line.className = 'grid horizontal major';
      frame.appendChild(line);
      this.dom.line = line;
    }

    if (orientation == 'top') {
      line.style.top = this.height + 'px';
      line.style.bottom = '';
    }
    else {
      line.style.top = '';
      line.style.bottom = this.height + 'px';
    }
  }
  else {
    if (line && line.parentElement) {
      frame.removeChild(line.line);
      delete this.dom.line;
    }
  }
};

/**
 * Determine the size of text on the axis (both major and minor axis).
 * The size is calculated only once and then cached in this.props.
 * @private
 */
TimeAxis.prototype._calculateCharSize = function () {
  // determine the char width and height on the minor axis
  if (!('minorCharHeight' in this.props)) {
    var textMinor = document.createTextNode('0');
    var measureCharMinor = document.createElement('DIV');
    measureCharMinor.className = 'text minor measure';
    measureCharMinor.appendChild(textMinor);
    this.frame.appendChild(measureCharMinor);

    this.props.minorCharHeight = measureCharMinor.clientHeight;
    this.props.minorCharWidth = measureCharMinor.clientWidth;

    this.frame.removeChild(measureCharMinor);
  }

  if (!('majorCharHeight' in this.props)) {
    var textMajor = document.createTextNode('0');
    var measureCharMajor = document.createElement('DIV');
    measureCharMajor.className = 'text major measure';
    measureCharMajor.appendChild(textMajor);
    this.frame.appendChild(measureCharMajor);

    this.props.majorCharHeight = measureCharMajor.clientHeight;
    this.props.majorCharWidth = measureCharMajor.clientWidth;

    this.frame.removeChild(measureCharMajor);
  }
};

/**
 * Calculate the scale and offset to convert a position on screen to the
 * corresponding date and vice versa.
 * After the method _updateConversion is executed once, the methods toTime
 * and toScreen can be used.
 * @private
 */
TimeAxis.prototype._updateConversion = function() {
  var range = this.range;
  if (!range) {
    throw new Error('No range configured');
  }

  if (range.conversion) {
    this.conversion = range.conversion(this.width);
  }
  else {
    this.conversion = Range.conversion(range.start, range.end, this.width);
  }
};

/**
 * Snap a date to a rounded value.
 * The snap intervals are dependent on the current scale and step.
 * @param {Date} date   the date to be snapped.
 * @return {Date} snappedDate
 */
TimeAxis.prototype.snap = function snap (date) {
  return this.step.snap(date);
};

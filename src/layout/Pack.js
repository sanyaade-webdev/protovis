pv.Layout.Pack = function() {
  pv.Layout.call(this);
  this.data(pv.identity)
      .size(function() { return 1; })
      .spacing(1)
      .left(function(n) { return n.x; })
      .top(function(n) { return n.y; })
      .radius(function(n) { return n.r; })
      .strokeStyle("rgb(31, 119, 180)")
      .fillStyle("rgba(31, 119, 180, .25)");
};

pv.Layout.Pack.prototype = pv.extend(pv.Layout)
    .property("spacing", Number);

// TODO is it possible for spacing to operate in pixel space?
// Right now it appears to be multiples of the smallest radius.

/**
 * Specifies the sizing function. By default, a sizing function is disabled and
 * all nodes are given constant size. The sizing function is invoked for each
 * leaf node in the tree (passed to the constructor).
 *
 * <p>For example, if the tree data structure represents a file system, with
 * files as leaf nodes, and each file has a <tt>bytes</tt> attribute, you can
 * specify a size function as:
 *
 * <pre>.size(function(d) d.bytes)</pre>
 *
 * @param {function} f the new sizing function.
 * @returns {pv.Layout.Pack} this.
 */
pv.Layout.Pack.prototype.size = function(f) {
  this.$radius = function() { return Math.sqrt(f.apply(this, arguments)); }
  return this;
};

pv.Layout.Pack.prototype.data = function(v) {
  var that = this, spacing;

  /** @private Compute the radii of the leaf nodes. */
  function radii(nodes) {
    var stack = pv.Mark.stack;
    stack.unshift(null);
    for (var i = 0, n = nodes.length; i < n; i++) {
      var c = nodes[i];
      if (!c.firstChild) {
        stack[0] = c.nodeValue;
        c.r = that.$radius.apply(that, stack);
      }
    }
    stack.shift();
  }

  /** @private */
  function packTree(n) {
    var nodes = [];
    for (var c = n.firstChild; c; c = c.nextSibling) {
      if (c.firstChild) c.r = packTree(c);
      c.n = c.p = c;
      nodes.push(c);
    }
    nodes.sort(function(a, b) { return a.r - b.r; });
    return packCircle(nodes);
  }

  /** @private */
  function packCircle(nodes) {
    var xMin = Infinity,
        xMax = -Infinity,
        yMin = Infinity,
        yMax = -Infinity,
        a, b, c, j, k;

    /** @private */
    function bound(n) {
      xMin = Math.min(n.x - n.r, xMin);
      xMax = Math.max(n.x + n.r, xMax);
      yMin = Math.min(n.y - n.r, yMin);
      yMax = Math.max(n.y + n.r, yMax);
    }

    /** @private */
    function insert(a, b) {
      var c = a.n;
      a.n = b;
      b.p = a;
      b.n = c;
      c.p = b;
    }

    /** @private */
    function splice(a, b) {
      a.n = b;
      b.p = a;
    }

    /** @private */
    function intersects(a, b) {
      var dx = b.x - a.x,
          dy = b.y - a.y,
          dr = a.r + b.r;
      return (dr * dr - dx * dx - dy * dy) > .001; // within epsilon
    }

    /* Create first node. */
    a = nodes[0];
    a.x = -a.r;
    a.y = 0;
    bound(a);

    /* Create second node. */
    if (nodes.length > 1) {
      b = nodes[1];
      b.x = b.r;
      b.y = 0;
      bound(b);

      /* Create third node and build chain. */
      if (nodes.length > 2) {
        c = nodes[2];
        place(a, b, c);
        bound(c);
        insert(a, c);
        a.p = c;
        insert(c, b);
        b = a.n;

        /* Now iterate through the rest. */
        for (var i = 3; i < nodes.length; i++) {
          place(a, b, c = nodes[i]);

          /* Search for the closest intersection. */
          var isect = 0, s1 = 1, s2 = 1;
          for (j = b.n; j != b; j = j.n, s1++) {
            if (intersects(j, c)) {
              isect = 1;
              break;
            }
          }
          if (isect == 1) {
            for (k = a.p; k != j.p; k = k.p, s2++) {
              if (intersects(k, c)) {
                if (s2 < s1) {
                  isect = -1;
                  j = k;
                }
                break;
              }
            }
          }

          /* Update node chain. */
          if (isect == 0) {
            insert(a, c);
            b = c;
            bound(c);
          } else if (isect > 0) {
            splice(a, j);
            b = j;
            i--;
          } else if (isect < 0) {
            splice(j, b);
            a = j;
            i--;
          }
        }
      }
    }

    /* Re-center the circles and return the encompassing radius. */
    var cx = (xMin + xMax) / 2,
        cy = (yMin + yMax) / 2,
        cr = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x -= cx;
      n.y -= cy;
      cr = Math.max(cr, n.r + Math.sqrt(n.x * n.x + n.y * n.y));
    }
    return cr + spacing;
  }

  /** @private */
  function place(a, b, c) {
    var da = b.r + c.r,
        db = a.r + c.r,
        dx = b.x - a.x,
        dy = b.y - a.y,
        dc = Math.sqrt(dx * dx + dy * dy),
        cos = (db * db + dc * dc - da * da) / (2 * db * dc),
        theta = Math.acos(cos),
        x = cos * db,
        h = Math.sin(theta) * db;
    dx /= dc;
    dy /= dc;
    c.x = a.x + x * dx + h * dy;
    c.y = a.y + x * dy - h * dx;
  }

  /** @private */
  function transform(n, x, y, k) {
    for (var c = n.firstChild; c; c = c.nextSibling) {
      c.x += n.x;
      c.y += n.y;
      transform(c, x, y, k);
    }
    n.x = x + k * n.x;
    n.y = y + k * n.y;
    n.r *= k;
  }

  /** @private */
  function data(v) {
    var nodes = pv.dom(v).nodes();

    spacing = that.spacing();
    radii(nodes);

    var root = nodes[0];
    root.x = 0;
    root.y = 0;
    root.r = packTree(root);

    var w = that.parent.width(),
        h = that.parent.height(),
        k = 1 / Math.max(2 * root.r / w, 2 * root.r / h);
    transform(root, w / 2, h / 2, k);

    return nodes;
  }

  return arguments.length
      ? pv.Mark.prototype.data.call(this, typeof v == "function"
          ? function() { return data(v.apply(this, arguments)); }
          : function() { return data(v); })
      : this.instance().data;
};

  // TODO is it possible for spacing to operate in pixel space?
  // Right now it appears to be multiples of the smallest radius.


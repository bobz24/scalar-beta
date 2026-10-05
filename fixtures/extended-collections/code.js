// Scalar fixture v3: Extended Collections (issue #88)
//
// Throwaway plugin that builds synthetic data, probes how Figma's Extended Collections
// behave, and hands the results back in a panel (Copy / Download) — no console needed.
// All names are generic; nothing from a real design system is read or needed.
//
// Three commands (manifest.json "menu"):
//   main     — builds two parents and four extensions, then runs every probe. Run it once,
//              in a new empty file.
//   existing — fallback, read-only: probes extensions already in the file, e.g. ones made
//              by hand when `main` couldn't create them through the API.
//   partb    — optional, run in a SECOND file: extends the first file's published collection.
//
// Design rules:
//   - Every step is a probe that runs in isolation and records its error as data, so one
//     wrong assumption about the API can't cost us the rest of the run.
//   - API-surface probes record which methods actually exist, so a wrong call can be
//     corrected from the same run's results instead of needing another run.
//   - Probes that change the file run last, and the file is put back where possible, so the
//     follow-up Scalar export sees clean data.

const FIXTURE_VERSION = 3;
const PARENT_NAME = 'ExtColl Parent';
const SINGLE_NAME = 'ExtColl Primitives';
const WATCH_CAP = 60; // most variables resolved per context by the read-only fallback

const probes = {}; // name -> { ok, ms, data } | { ok: false, ms, error, errorType }
const runInfo = { startedAt: Date.now(), panelUserAgent: '__unavailable__' };

function message(e) {
  return String((e && e.message) || e);
}

async function probe(name, fn) {
  const t0 = Date.now();
  try {
    probes[name] = { ok: true, ms: 0, data: await fn() };
  } catch (e) {
    probes[name] = { ok: false, ms: 0, error: message(e), errorType: (e && e.name) || typeof e };
  }
  probes[name].ms = Date.now() - t0;
  return probes[name];
}

// Property reads that may throw or be absent. undefined becomes an explicit marker so
// "this field does not exist" is distinguishable from "null" in the results.
function read(fn) {
  try {
    const v = fn();
    return v === undefined ? '__undefined__' : v;
  } catch (e) {
    return { __error: message(e) };
  }
}
async function readAsync(fn) {
  try {
    const v = await fn();
    return v === undefined ? '__undefined__' : v;
  } catch (e) {
    return { __error: message(e) };
  }
}
function plain(x) {
  return x === undefined ? '__undefined__' : JSON.parse(JSON.stringify(x));
}

// Last-resort serializer, used only if plain JSON.stringify fails on the whole result.
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (k, val) => {
      if (typeof val === 'bigint' || typeof val === 'symbol') return String(val);
      if (typeof val === 'function') return '[function]';
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[repeated]';
        seen.add(val);
      }
      return val;
    },
    2,
  );
}

const rgb = (r, g, b) => ({ r, g, b, a: 1 });
const alias = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id });
const modeIdByName = (coll, name) => {
  const m = coll && coll.modes.find((x) => x.name === name);
  return m ? m.modeId : null;
};
const overridesFor = (ext, variableId) => plain((ext.variableOverrides || {})[variableId]);
const present = (pairs) => pairs.filter(([, x]) => x);

// ---------- API surface ----------

// The members each object should have, per the docs. Checked by name so a renamed or
// missing method shows up as data, not as a mystery failure.
const EXPECTED = {
  variablesApi: [
    'createVariableCollection',
    'createVariable',
    'getLocalVariableCollectionsAsync',
    'getLocalVariablesAsync',
    'getVariableByIdAsync',
    'getVariableCollectionByIdAsync',
    'extendLibraryCollectionByKeyAsync',
    'importVariableByKeyAsync',
    'setBoundVariableForPaint',
    'createVariableAlias',
  ],
  teamLibrary: ['getAvailableLibraryVariableCollectionsAsync', 'getVariablesInLibraryCollectionAsync'],
  collection: ['extend', 'addMode', 'removeMode', 'renameMode', 'remove', 'isExtension', 'key', 'defaultModeId'],
  extension: [
    'extend',
    'addMode',
    'removeMode',
    'renameMode',
    'removeOverridesForVariable',
    'remove',
    'isExtension',
    'parentVariableCollectionId',
    'rootVariableCollectionId',
    'variableOverrides',
    'defaultModeId',
  ],
  variable: ['setValueForMode', 'valuesByModeForCollectionAsync', 'resolveForConsumer', 'remove', 'valuesByMode'],
  frame: ['setExplicitVariableModeForCollection', 'clearExplicitVariableModeForCollection', 'explicitVariableModes'],
};
const OBJECT_PROTO = new Set(Object.getOwnPropertyNames(Object.prototype));

function surface(obj, expected) {
  if (!obj) return null;
  const members = read(() => {
    const names = new Set();
    let p = obj;
    for (let depth = 0; p && depth < 6; depth++) {
      for (const n of Object.getOwnPropertyNames(p)) if (!OBJECT_PROTO.has(n)) names.add(n);
      p = Object.getPrototypeOf(p);
    }
    return Array.from(names).sort();
  });
  const expectedTypes = {};
  for (const n of expected) expectedTypes[n] = read(() => typeof obj[n]);
  return { members, expected: expectedTypes };
}

async function probeFigmaSurface() {
  await probe('api-surface.figma', async () => ({
    variables: surface(figma.variables, EXPECTED.variablesApi),
    teamLibrary: read(() => surface(figma.teamLibrary, EXPECTED.teamLibrary)),
  }));
}

// ---------- Dumps ----------

function dumpCollection(c) {
  return {
    id: c.id,
    name: c.name,
    key: read(() => c.key),
    remote: read(() => c.remote),
    defaultModeId: read(() => c.defaultModeId),
    hiddenFromPublishing: read(() => c.hiddenFromPublishing),
    modes: read(() =>
      c.modes.map((m) => ({ modeId: m.modeId, name: m.name, parentModeId: read(() => m.parentModeId) })),
    ),
    variableIds: read(() => plain(c.variableIds)),
    isExtension: read(() => c.isExtension),
    parentVariableCollectionId: read(() => c.parentVariableCollectionId),
    rootVariableCollectionId: read(() => c.rootVariableCollectionId),
    variableOverrides: read(() => plain(c.variableOverrides)),
  };
}

function dumpVariable(v) {
  return {
    id: v.id,
    name: v.name,
    key: read(() => v.key),
    remote: read(() => v.remote),
    variableCollectionId: v.variableCollectionId,
    resolvedType: v.resolvedType,
    scopes: read(() => plain(v.scopes)),
    description: read(() => v.description),
    hiddenFromPublishing: read(() => v.hiddenFromPublishing),
    codeSyntax: read(() => plain(v.codeSyntax)),
    valuesByMode: read(() => plain(v.valuesByMode)),
  };
}

// The effective value per mode of `coll`, overridden or inherited (docs: valuesByModeForCollectionAsync).
async function valuesFor(v, coll) {
  if (typeof v.valuesByModeForCollectionAsync !== 'function') {
    return { __missing: 'valuesByModeForCollectionAsync' };
  }
  return plain(await v.valuesByModeForCollectionAsync(coll));
}

// What a consumer sees: a frame pinned to one mode of each collection in `pins`, resolved
// through a rectangle inside it. `explicitVariableModes` is read back so a pin that silently
// didn't take is visible in the results rather than mistaken for an answer.
async function resolveIn(pins, variables) {
  const frame = figma.createFrame();
  frame.name = '__fixture_consumer';
  try {
    const pinResults = [];
    for (const [coll, modeId] of pins) {
      try {
        frame.setExplicitVariableModeForCollection(coll, modeId);
        pinResults.push({ collection: coll.name, modeId, ok: true, via: 'collection object' });
      } catch (e1) {
        try {
          frame.setExplicitVariableModeForCollection(coll.id, modeId);
          pinResults.push({ collection: coll.name, modeId, ok: true, via: 'collection id', firstError: message(e1) });
        } catch (e2) {
          pinResults.push({ collection: coll.name, modeId, ok: false, error: message(e2) });
        }
      }
    }
    const explicitVariableModes = read(() => plain(frame.explicitVariableModes));
    const rect = figma.createRectangle();
    frame.appendChild(rect);
    const resolved = {};
    const bindErrors = {};
    for (const [label, v] of variables) {
      resolved[label] = await readAsync(async () => {
        if (v.resolvedType === 'COLOR') {
          try {
            rect.fills = [
              figma.variables.setBoundVariableForPaint(
                { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
                'color',
                v,
              ),
            ];
          } catch (e) {
            bindErrors[label] = message(e);
          }
        }
        return plain(v.resolveForConsumer(rect));
      });
    }
    return { pins: pinResults, explicitVariableModes, resolved, bindErrors };
  } finally {
    try {
      frame.remove();
    } catch (e) {
      // Never let cleanup replace the probe's real answer.
    }
  }
}

async function snapshotCollections() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map(dumpCollection);
}
async function snapshotVariables() {
  const variables = await figma.variables.getLocalVariablesAsync();
  return variables.map(dumpVariable);
}
async function existingCollectionNames() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map((c) => c.name);
}

// ---------- Part A: main test ----------

// A 2-mode "theme" parent. Primitives and semantics share it, plus `link`, whose override
// in Acme re-points it across collections, and (added later) `brand`, which aliases into the
// separate primitives collection the way real systems are usually built.
function buildParent() {
  const coll = figma.variables.createVariableCollection(PARENT_NAME);
  const light = coll.modes[0].modeId;
  coll.renameMode(light, 'Light');
  const dark = coll.addMode('Dark'); // throws on plans capped at one mode

  const V = {};
  const make = (name, type, values, scopes) => {
    const v = figma.variables.createVariable(name, coll, type);
    if (scopes) v.scopes = scopes;
    v.setValueForMode(light, values[0]);
    v.setValueForMode(dark, values[1]);
    V[name] = v;
    return v;
  };
  make('color/primitive/blue-500', 'COLOR', [rgb(0.23, 0.51, 0.96), rgb(0.23, 0.51, 0.96)]);
  make('color/primitive/blue-900', 'COLOR', [rgb(0.09, 0.13, 0.34), rgb(0.09, 0.13, 0.34)]);
  const b500 = V['color/primitive/blue-500'];
  const b900 = V['color/primitive/blue-900'];
  make('color/semantic/accent', 'COLOR', [alias(b500), alias(b900)]);
  make('color/semantic/text', 'COLOR', [alias(b900), alias(b900)]);
  make('color/semantic/link', 'COLOR', [alias(b500), alias(b500)]);
  make('color/semantic/surface', 'COLOR', [rgb(1, 1, 1), rgb(0.07, 0.07, 0.07)]);
  make('color/semantic/border', 'COLOR', [rgb(0.8, 0.8, 0.8), rgb(0.3, 0.3, 0.3)]);
  make('space/small', 'FLOAT', [4, 4]);
  make('space/medium', 'FLOAT', [8, 8]);
  make('radius/button', 'FLOAT', [8, 8], ['CORNER_RADIUS']);
  make('text/enabled', 'BOOLEAN', [true, true]);
  make('brand/name', 'STRING', ['Base', 'Base']);
  make('brand/tagline', 'STRING', ['Base tagline', 'Base tagline']);
  return { coll, light, dark, V };
}

// A single-mode "primitives" parent, as many real systems keep primitives separately.
function buildSingle() {
  const coll = figma.variables.createVariableCollection(SINGLE_NAME);
  const mode = coll.modes[0].modeId;
  coll.renameMode(mode, 'Default');
  const P = {};
  const make = (name, type, value) => {
    const v = figma.variables.createVariable(name, coll, type);
    v.setValueForMode(mode, value);
    P[name] = v;
    return v;
  };
  make('brand/red-500', 'COLOR', rgb(0.9, 0.2, 0.2));
  make('brand/red-900', 'COLOR', rgb(0.45, 0.05, 0.05));
  make('brand/accent-alias', 'COLOR', alias(P['brand/red-900']));
  make('size/base', 'FLOAT', 16);
  return { coll, mode, P };
}

// Set an override on the extension mode that inherits from `parentModeId`. `value` may be a
// function, so values that depend on other probes (e.g. the single-mode parent) are only
// built inside the probe that uses them.
function setOverride(ext, variable, parentModeId, value) {
  const m = ext.modes.find((x) => x.parentModeId === parentModeId);
  if (!m) throw new Error('no extension mode inherits parent mode ' + parentModeId);
  variable.setValueForMode(m.modeId, typeof value === 'function' ? value() : value);
}

const FALLBACK_HINT = 'Follow "If the panel sends you here" in the README, then send both results files.';

async function runMain() {
  await probeFigmaSurface();
  await probe('preflight.existing-collections (should be empty)', existingCollectionNames);

  let main = null;
  const b = await probe('build.parent (2 modes)', async () => {
    main = buildParent();
    return { collectionId: main.coll.id, modes: main.coll.modes.length, variables: Object.keys(main.V).length };
  });
  if (!b.ok) {
    return {
      blocker: /limited to/i.test(b.error)
        ? 'Could not build the parent collection: ' + b.error + ' — a plan limited to one mode per collection cannot run this test.'
        : 'Could not build the parent collection: ' + b.error + '.',
    };
  }
  const { coll: parent, light, dark, V } = main;

  await probe('api-surface.collection', async () => surface(parent, EXPECTED.collection));
  await probe('api-surface.variable', async () => surface(V['space/medium'], EXPECTED.variable));
  await probe('api-surface.frame', async () => {
    const f = figma.createFrame();
    try {
      return surface(f, EXPECTED.frame);
    } finally {
      try {
        f.remove();
      } catch (e) {
        // ignore
      }
    }
  });

  let single = null;
  await probe('build.single-mode-parent', async () => {
    single = buildSingle();
    return { collectionId: single.coll.id, modes: single.coll.modes.length, variables: Object.keys(single.P).length };
  });

  const v = (name) => {
    if (!V[name]) throw new Error('missing variable ' + name);
    return V[name];
  };
  const p = (name) => {
    if (!single || !single.P[name]) throw new Error('single-mode parent unavailable: ' + name);
    return single.P[name];
  };

  // Real topology: a theme variable aliasing into a separate primitives collection.
  await probe('build.cross-collection alias in parent (brand → primitives)', async () => {
    const brand = figma.variables.createVariable('color/semantic/brand', parent, 'COLOR');
    brand.setValueForMode(light, alias(p('brand/red-500')));
    brand.setValueForMode(dark, alias(p('brand/red-900')));
    V['color/semantic/brand'] = brand;
    return dumpVariable(brand);
  });

  let acme = null;
  const a = await probe('extend.acme', async () => {
    acme = parent.extend('Acme');
    return dumpCollection(acme);
  });
  if (!a.ok) {
    return {
      blocker: /enterprise/i.test(a.error)
        ? 'Could not create an extended collection: ' + a.error + ' — this test needs an Enterprise plan.'
        : 'Could not create an extended collection through the API: ' + a.error + '. ' + FALLBACK_HINT,
    };
  }
  await probe('api-surface.extension', async () => surface(acme, EXPECTED.extension));

  // Acme: one probe per case, so a failure in one doesn't hide the others.
  const acmeRows = [
    ['accent: Light only, alias → raw', 'color/semantic/accent', [[light, rgb(1, 0.42, 0)]]],
    [
      'blue-900: both modes, raw → raw (an alias target)',
      'color/primitive/blue-900',
      [
        [light, rgb(0.6, 0.1, 0.1)],
        [dark, rgb(0.9, 0.4, 0.4)],
      ],
    ],
    [
      'link: alias → alias (Light: other collection, Dark: same collection)',
      'color/semantic/link',
      [
        [light, () => alias(p('brand/red-500'))],
        [dark, () => alias(v('color/primitive/blue-900'))],
      ],
    ],
    [
      'surface: both modes, raw → raw',
      'color/semantic/surface',
      [
        [light, rgb(0.98, 0.95, 0.9)],
        [dark, rgb(0.1, 0.08, 0.06)],
      ],
    ],
    ['border: Light only, raw → alias', 'color/semantic/border', [[light, () => alias(v('color/primitive/blue-500'))]]],
    ['space/medium: Light only (number)', 'space/medium', [[light, 12]]],
    [
      'radius/button: both modes (scoped number)',
      'radius/button',
      [
        [light, 6],
        [dark, 6],
      ],
    ],
    ['text/enabled: Light only (boolean)', 'text/enabled', [[light, false]]],
    ['brand/name: Light only (string)', 'brand/name', [[light, 'Acme']]],
    ['brand/tagline: Light only (reset later)', 'brand/tagline', [[light, 'Acme tagline']]],
  ];
  let failedOverrides = 0;
  for (const [label, varName, sets] of acmeRows) {
    const r = await probe('acme.override ' + label, async () => {
      for (const [parentModeId, value] of sets) setOverride(acme, v(varName), parentModeId, value);
      return overridesFor(acme, v(varName).id);
    });
    if (!r.ok) failedOverrides++;
  }
  const notice =
    failedOverrides === acmeRows.length ? 'Overrides could not be set through the API. ' + FALLBACK_HINT : null;

  // Creating an extension and overriding in it are separate probes, so if overrides can't be
  // set, each extension's structure is still recorded.

  // A second brand off the same parent: are its overrides independent of Acme's?
  let beta = null;
  await probe('extend.beta (second brand)', async () => {
    beta = parent.extend('Beta');
    return dumpCollection(beta);
  });
  await probe('beta.override space/medium + brand/name (Light)', async () => {
    if (!beta) throw new Error('skipped: Beta unavailable');
    setOverride(beta, v('space/medium'), light, 20);
    setOverride(beta, v('brand/name'), light, 'Beta');
    return { spaceMedium: overridesFor(beta, v('space/medium').id), brandName: overridesFor(beta, v('brand/name').id) };
  });

  // An extension of an extension. The mode is chosen by name, because whether its modes
  // link to Acme's modes or to the root's is itself one of the questions (see the dump).
  let sub = null;
  await probe('extend.chain (Acme Sub extends Acme)', async () => {
    sub = acme.extend('Acme Sub');
    return dumpCollection(sub);
  });
  await probe('chain.override brand/name (Light)', async () => {
    if (!sub) throw new Error('skipped: chain unavailable');
    const subLight = modeIdByName(sub, 'Light');
    if (!subLight) throw new Error('chain has no mode named Light');
    v('brand/name').setValueForMode(subLight, 'Acme Sub');
    return overridesFor(sub, v('brand/name').id);
  });

  // An extension of the single-mode parent.
  let primsAcme = null;
  await probe('extend.single-mode (Primitives Acme)', async () => {
    if (!single) throw new Error('skipped: single-mode parent unavailable');
    primsAcme = single.coll.extend('Primitives Acme');
    return dumpCollection(primsAcme);
  });
  await probe('single-mode.override red-500, size/base, accent-alias', async () => {
    if (!primsAcme) throw new Error('skipped: Primitives Acme unavailable');
    setOverride(primsAcme, p('brand/red-500'), single.mode, rgb(0.8, 0.1, 0.5));
    setOverride(primsAcme, p('size/base'), single.mode, 18);
    setOverride(primsAcme, p('brand/accent-alias'), single.mode, () => alias(p('brand/red-500')));
    return plain(primsAcme.variableOverrides);
  });

  // How an adapter would reach an extension and its variables: by id.
  await probe('lookup-by-id', async () => {
    const ext = await figma.variables.getVariableCollectionByIdAsync(acme.id);
    const variable = await figma.variables.getVariableByIdAsync(v('color/semantic/accent').id);
    return { extension: ext ? dumpCollection(ext) : null, variable: variable ? dumpVariable(variable) : null };
  });

  await probe('snapshot.collections', snapshotCollections);
  await probe('snapshot.variables', snapshotVariables);

  // Effective value of every variable in every collection (overridden or inherited).
  await probe('effective-values', async () => {
    const pairs = [
      [parent, V],
      [acme, V],
      [beta, V],
      [sub, V],
      [single && single.coll, single && single.P],
      [primsAcme, single && single.P],
    ].filter(([c, vars]) => c && vars);
    const out = {};
    for (const [coll, vars] of pairs) {
      out[coll.name] = {};
      for (const [name, variable] of Object.entries(vars)) {
        out[coll.name][name] = await readAsync(() => valuesFor(variable, coll));
      }
    }
    return out;
  });

  // What a consumer sees when pinned to a mode — the alias-through-override question.
  // parent/Light vs parent/Dark doubles as a control: accent differs between them by design.
  await probe('consumer-resolution', async () => {
    const themeWatch = present([
      ['text (aliases blue-900)', V['color/semantic/text']],
      ['accent', V['color/semantic/accent']],
      ['link (re-pointed alias)', V['color/semantic/link']],
      ['brand (aliases primitives)', V['color/semantic/brand']],
      ['border', V['color/semantic/border']],
      ['blue-900', V['color/primitive/blue-900']],
      ['surface', V['color/semantic/surface']],
      ['space/medium', V['space/medium']],
      ['brand/name', V['brand/name']],
    ]);
    const primsWatch = single
      ? present([
          ['red-500', single.P['brand/red-500']],
          ['accent-alias', single.P['brand/accent-alias']],
          ['size/base', single.P['size/base']],
        ])
      : [];
    const acmeLight = modeIdByName(acme, 'Light');
    const primsMode = primsAcme && primsAcme.modes[0] && primsAcme.modes[0].modeId;
    const contexts = [
      ['parent/Light', [[parent, light]], themeWatch],
      ['parent/Dark', [[parent, dark]], themeWatch],
      ['Acme/Light', [[acme, acmeLight]], themeWatch],
      ['Acme/Dark', [[acme, modeIdByName(acme, 'Dark')]], themeWatch],
      ['Beta/Light', [[beta, modeIdByName(beta, 'Light')]], themeWatch],
      ['Acme Sub/Light', [[sub, modeIdByName(sub, 'Light')]], themeWatch],
      ['Primitives Acme', [[primsAcme, primsMode]], primsWatch],
      ['Acme/Light + Primitives Acme', [[acme, acmeLight], [primsAcme, primsMode]], themeWatch.concat(primsWatch)],
    ].filter(([, pins]) => pins.every(([c, m]) => c && m));
    const out = {};
    for (const [label, pins, watch] of contexts) out[label] = await resolveIn(pins, watch);
    return out;
  });

  // Reset an override: how does "back to inherited" appear?
  await probe('reset-override (removeOverridesForVariable)', async () => {
    const tagline = v('brand/tagline');
    const before = { overrides: overridesFor(acme, tagline.id), effective: await valuesFor(tagline, acme) };
    acme.removeOverridesForVariable(tagline);
    const after = { overrides: overridesFor(acme, tagline.id), effective: await valuesFor(tagline, acme) };
    return { before, after };
  });

  // ----- Probes below change the file. They run last and tidy up after themselves. -----

  // What can an extension do on its own? The docs say it can't add modes or variables; if
  // it can, the adapter has to handle extension-owned data.
  await probe('extension-capability.rename-own-mode', async () => {
    const id = modeIdByName(acme, 'Light');
    if (!id) throw new Error('no Acme mode named Light');
    acme.renameMode(id, 'Acme Light');
    const after = { acme: plain(acme.modes), parent: plain(parent.modes) };
    let restored = 'restored to Light';
    try {
      acme.renameMode(id, 'Light');
    } catch (e) {
      restored = { error: message(e) };
    }
    return { after, restored };
  });
  await probe('extension-capability.add-own-mode (expected not allowed)', async () => {
    let id;
    try {
      id = acme.addMode('Acme only');
    } catch (e) {
      return { allowed: false, error: message(e) };
    }
    const modes = plain(acme.modes);
    let cleanup = 'removed';
    try {
      acme.removeMode(id);
    } catch (e) {
      cleanup = { error: message(e) };
    }
    return { allowed: true, newModeId: id, modes, cleanup };
  });
  await probe('extension-capability.create-own-variable (expected not allowed)', async () => {
    let own;
    try {
      own = figma.variables.createVariable('acme/own', acme, 'FLOAT');
    } catch (e) {
      return { allowed: false, error: message(e) };
    }
    const result = {
      allowed: true,
      variable: dumpVariable(own),
      inAcmeVariableIds: read(() => acme.variableIds.includes(own.id)),
      inParentVariableIds: read(() => parent.variableIds.includes(own.id)),
    };
    try {
      own.remove();
      result.cleanup = 'removed';
    } catch (e) {
      result.cleanup = { error: message(e) };
    }
    return result;
  });

  // Does an extension pick up a variable added to the parent, and drop it (and its
  // override) when the variable is deleted? Stale override keys would trip a reader.
  await probe('variable-sync.add-override-delete', async () => {
    const temp = figma.variables.createVariable('space/temporary', parent, 'FLOAT');
    temp.setValueForMode(light, 1);
    temp.setValueForMode(dark, 1);
    const id = temp.id;
    const afterAdd = { inAcmeVariableIds: acme.variableIds.includes(id), acmeEffective: await valuesFor(temp, acme) };
    let afterOverride;
    try {
      setOverride(acme, temp, light, 2);
      afterOverride = { acmeOverride: overridesFor(acme, id) };
    } catch (e) {
      afterOverride = { overrideError: message(e) }; // keep going: the delete is still worth seeing
    }
    temp.remove();
    const afterDelete = { inAcmeVariableIds: acme.variableIds.includes(id), staleOverride: overridesFor(acme, id) };
    return { afterAdd, afterOverride, afterDelete };
  });

  // Do extension modes follow the parent's modes?
  const modesOf = () => ({
    parent: plain(parent.modes),
    acme: plain(acme.modes),
    beta: beta ? plain(beta.modes) : null,
    sub: sub ? plain(sub.modes) : null,
  });
  let addedModeId = null;
  await probe('mode-sync.add-parent-mode', async () => {
    addedModeId = parent.addMode('High contrast');
    return { addedModeId, modes: modesOf() };
  });
  await probe('mode-sync.rename-parent-mode', async () => {
    parent.renameMode(light, 'Light (renamed)');
    return { modes: modesOf() };
  });
  // Delete a parent mode that an extension has an override on. Does the extension's mode
  // (and override) disappear, or is it left orphaned for ext.removeMode()?
  await probe('mode-sync.delete-parent-mode', async () => {
    if (!addedModeId) throw new Error('skipped: add-parent-mode failed');
    const doomed = acme.modes.find((m) => m.parentModeId === addedModeId);
    let overrideOnDoomedMode = doomed ? true : 'Acme has no mode for the added parent mode';
    if (doomed) {
      try {
        v('brand/name').setValueForMode(doomed.modeId, 'Acme high contrast');
      } catch (e) {
        overrideOnDoomedMode = { error: message(e) }; // keep going: the deletion is still worth seeing
      }
    }
    const before = { overrideOnDoomedMode, brandNameOverrides: overridesFor(acme, v('brand/name').id) };
    parent.removeMode(addedModeId);
    const after = { modes: modesOf(), brandNameOverrides: overridesFor(acme, v('brand/name').id) };
    const orphan = acme.modes.find((m) => m.parentModeId === addedModeId);
    let orphanCleanup = 'no orphaned mode left on Acme';
    if (orphan) {
      try {
        acme.removeMode(orphan.modeId);
        orphanCleanup = { removedWith: 'acme.removeMode', acmeModes: plain(acme.modes) };
      } catch (e) {
        orphanCleanup = { error: message(e) };
      }
    }
    return { before, after, orphanCleanup };
  });
  await probe('mode-sync.restore-name', async () => {
    parent.renameMode(light, 'Light');
    return { modes: modesOf() };
  });

  await probe('snapshot.collections.final', snapshotCollections);
  return { blocker: null, notice };
}

// ---------- Fallback: probe existing extensions (read-only) ----------

async function runExisting() {
  await probeFigmaSurface();
  let extensions = [];
  await probe('existing.collections', async () => {
    const all = await figma.variables.getLocalVariableCollectionsAsync();
    extensions = all.filter((c) => read(() => c.isExtension) === true);
    return all.map(dumpCollection);
  });
  if (!extensions.length) {
    return {
      blocker: 'No extended collections found in this file. Create one first (see "If the panel sends you here" in the README).',
    };
  }
  await probe('api-surface.extension', async () => surface(extensions[0], EXPECTED.extension));
  await probe('snapshot.variables', snapshotVariables);

  for (const ext of extensions) {
    const tag = 'existing[' + ext.name + ']';
    const vars = [];
    await probe(tag + '.parent-by-id', async () => {
      const parentColl = await figma.variables.getVariableCollectionByIdAsync(ext.parentVariableCollectionId);
      return parentColl ? dumpCollection(parentColl) : null;
    });
    await probe(tag + '.variables-by-id', async () => {
      for (const id of ext.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(id);
        if (variable) vars.push(variable);
      }
      return vars.map(dumpVariable);
    });
    await probe(tag + '.effective-values', async () => {
      const out = {};
      for (const variable of vars) out[variable.name] = await readAsync(() => valuesFor(variable, ext));
      return out;
    });
    await probe(tag + '.consumer-resolution', async () => {
      const watch = vars.slice(0, WATCH_CAP).map((variable) => [variable.name, variable]);
      const out = { truncated: vars.length > WATCH_CAP };
      for (const m of ext.modes) out[ext.name + '/' + m.name] = await resolveIn([[ext, m.modeId]], watch);
      return out;
    });
  }
  return { blocker: null };
}

// ---------- Part B: remote parent (second file) ----------

async function runPartB() {
  await probeFigmaSurface();
  await probe('partb.preflight.existing-collections (should be empty)', existingCollectionNames);

  let libs = [];
  await probe('partb.list-library-collections', async () => {
    libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return libs.map((c) => ({ name: c.name, key: c.key, libraryName: c.libraryName }));
  });
  const lib = libs.find((c) => c.name === PARENT_NAME);
  if (!lib) {
    return {
      blocker:
        'No library collection named "' +
        PARENT_NAME +
        '" is available in this file. Publish the first file as a library and turn it on here first (see the README, Part B).',
    };
  }

  let ext = null;
  const e = await probe('partb.extend-library-collection', async () => {
    ext = await figma.variables.extendLibraryCollectionByKeyAsync(lib.key, 'Remote Acme');
    return dumpCollection(ext);
  });
  if (!e.ok) return { blocker: 'Could not extend the library collection: ' + e.error };
  await probe('api-surface.extension (remote parent)', async () => surface(ext, EXPECTED.extension));

  // How an adapter would reach the remote parent and its variables: by id.
  await probe('partb.parent-by-id', async () => {
    const parentColl = await figma.variables.getVariableCollectionByIdAsync(ext.parentVariableCollectionId);
    return parentColl ? dumpCollection(parentColl) : null;
  });
  await probe('partb.variables-by-id', async () => {
    const out = {};
    for (const id of ext.variableIds) {
      out[id] = await readAsync(async () => {
        const variable = await figma.variables.getVariableByIdAsync(id);
        return variable ? dumpVariable(variable) : null;
      });
    }
    return out;
  });

  const byName = {};
  await probe('partb.import-variables', async () => {
    const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lib.key);
    const out = [];
    for (const lv of libVars) {
      out.push(
        await readAsync(async () => {
          byName[lv.name] = await figma.variables.importVariableByKeyAsync(lv.key);
          return { name: lv.name, key: lv.key, resolvedType: lv.resolvedType, importedId: byName[lv.name].id };
        }),
      );
    }
    return out;
  });
  const lv = (name) => {
    if (!byName[name]) throw new Error('library variable not imported: ' + name);
    return byName[name];
  };

  // By position, not name, in case the parent's mode names changed before publishing.
  const MODE_INDEX = { Light: 0, Dark: 1 };
  const modeOf = (role) => {
    const m = ext.modes[MODE_INDEX[role]];
    if (!m) throw new Error('no mode at position ' + MODE_INDEX[role]);
    return m.modeId;
  };
  await probe('partb.override space/medium: Light only', async () => {
    lv('space/medium').setValueForMode(modeOf('Light'), 12);
    return overridesFor(ext, lv('space/medium').id);
  });
  await probe('partb.override brand/name: Light only', async () => {
    lv('brand/name').setValueForMode(modeOf('Light'), 'Remote Acme');
    return overridesFor(ext, lv('brand/name').id);
  });
  await probe('partb.override blue-900: both modes (an alias target)', async () => {
    lv('color/primitive/blue-900').setValueForMode(modeOf('Light'), rgb(0.6, 0.1, 0.1));
    lv('color/primitive/blue-900').setValueForMode(modeOf('Dark'), rgb(0.9, 0.4, 0.4));
    return overridesFor(ext, lv('color/primitive/blue-900').id);
  });
  await probe('partb.override accent: Light → alias to a library variable', async () => {
    lv('color/semantic/accent').setValueForMode(modeOf('Light'), alias(lv('color/primitive/blue-500')));
    return overridesFor(ext, lv('color/semantic/accent').id);
  });

  await probe('partb.snapshot.collections', snapshotCollections);
  await probe('partb.snapshot.variables', snapshotVariables);
  await probe('partb.effective-values', async () => {
    const out = {};
    for (const [name, variable] of Object.entries(byName)) {
      out[name] = await readAsync(() => valuesFor(variable, ext));
    }
    return out;
  });
  await probe('partb.consumer-resolution', async () => {
    const watch = [
      'color/semantic/text',
      'color/semantic/accent',
      'color/semantic/link',
      'color/semantic/brand',
      'space/medium',
      'brand/name',
    ]
      .filter((n) => byName[n])
      .map((n) => [n, byName[n]]);
    const out = {};
    for (const role of ['Light', 'Dark']) {
      out['Remote Acme/' + role] = await resolveIn([[ext, modeOf(role)]], watch);
    }
    return out;
  });
  return { blocker: null };
}

// ---------- Entry ----------

const COMMANDS = {
  main: { run: runMain, label: 'Part A (main test)', fileName: 'extcoll-fixture-partA.json' },
  existing: { run: runExisting, label: 'Fallback (existing extensions)', fileName: 'extcoll-fixture-existing.json' },
  partb: { run: runPartB, label: 'Part B (remote parent)', fileName: 'extcoll-fixture-partB.json' },
};

let ready = Promise.resolve();

async function deliver(cmd, extra) {
  await ready; // first, so the panel's user agent (Figma version) is in before meta is built
  const results = {
    meta: {
      fixtureVersion: FIXTURE_VERSION,
      command: read(() => figma.command),
      label: cmd.label,
      ranAt: new Date(runInfo.startedAt).toISOString(),
      durationMs: Date.now() - runInfo.startedAt,
      editorType: read(() => figma.editorType),
      figmaMode: read(() => figma.mode),
      apiVersion: read(() => figma.apiVersion),
      documentColorProfile: read(() => figma.root.documentColorProfile),
      panelUserAgent: runInfo.panelUserAgent, // carries the Figma app version
    },
    blocker: extra.blocker || null,
    notice: extra.notice || null,
    fatal: extra.fatal || null,
    probes,
  };
  let json;
  try {
    json = JSON.stringify(results, null, 2);
  } catch (e) {
    json = safeStringify(results);
  }
  figma.ui.postMessage({
    type: 'results',
    label: cmd.label,
    fileName: cmd.fileName,
    blocker: results.blocker || results.fatal,
    notice: results.notice,
    summary: Object.keys(probes).map((name) => ({ name, ok: probes[name].ok })),
    json,
  });
}

async function main() {
  figma.showUI(__html__, { width: 620, height: 580, themeColors: true });
  ready = new Promise((resolve) => {
    figma.ui.onmessage = (msg) => {
      if (msg && msg.type === 'ready') {
        if (msg.userAgent) runInfo.panelUserAgent = String(msg.userAgent);
        resolve();
      }
      if (msg && msg.type === 'close') figma.closePlugin();
    };
    if (typeof setTimeout === 'function') setTimeout(resolve, 4000); // never wait forever on the panel
  });
  const cmd = COMMANDS[figma.command] || COMMANDS.main;
  try {
    await deliver(cmd, await cmd.run());
  } catch (e) {
    // Never hang silently: report the unexpected error in the panel instead.
    await deliver(cmd, { fatal: 'Unexpected error: ' + message(e) });
  }
}

main().catch((e) => {
  // Reached only if even the panel can't be updated.
  try {
    figma.notify('Scalar fixture failed: ' + message(e), { timeout: 10000 });
  } catch (_) {
    // Nothing left to report through.
  }
});

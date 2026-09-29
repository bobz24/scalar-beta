// Scalar fixture: Extended Collections (issue #88)
//
// Throwaway, no-UI plugin. Two commands (see manifest.json "menu"):
//   1. build — creates a small synthetic parent collection + variables.
//   2. dump  — logs the raw Plugin API view of every local variable collection
//              and variable to the console, between FIXTURE_DUMP_START/END markers.
//
// Creating the *extension* itself (parent → child "Acme") is done by hand in Figma's
// own UI (see README.md) — whether that's even scriptable via the Plugin API is one of
// the open questions this fixture exists to answer, so this code doesn't assume it.
//
// All names below are generic/synthetic — no real design-system data is read or needed.
// Run this against a throwaway file, not a production one.

const PARENT_NAME = 'ExtColl Parent';

async function build() {
  const collection = figma.variables.createVariableCollection(PARENT_NAME);
  const lightModeId = collection.modes[0].modeId;
  collection.renameMode(lightModeId, 'Light');
  const darkModeId = collection.addMode('Dark');

  const blue500 = figma.variables.createVariable('color/primitive/blue-500', collection, 'COLOR');
  blue500.setValueForMode(lightModeId, { r: 0.23, g: 0.51, b: 0.96, a: 1 });
  blue500.setValueForMode(darkModeId, { r: 0.23, g: 0.51, b: 0.96, a: 1 });

  const blue900 = figma.variables.createVariable('color/primitive/blue-900', collection, 'COLOR');
  blue900.setValueForMode(lightModeId, { r: 0.09, g: 0.13, b: 0.34, a: 1 });
  blue900.setValueForMode(darkModeId, { r: 0.09, g: 0.13, b: 0.34, a: 1 });

  const accent = figma.variables.createVariable('color/semantic/accent', collection, 'COLOR');
  accent.setValueForMode(lightModeId, { type: 'VARIABLE_ALIAS', id: blue500.id });
  accent.setValueForMode(darkModeId, { type: 'VARIABLE_ALIAS', id: blue900.id });

  const text = figma.variables.createVariable('color/semantic/text', collection, 'COLOR');
  text.setValueForMode(lightModeId, { type: 'VARIABLE_ALIAS', id: blue900.id });
  text.setValueForMode(darkModeId, { type: 'VARIABLE_ALIAS', id: blue900.id });

  const spaceSmall = figma.variables.createVariable('space/small', collection, 'FLOAT');
  spaceSmall.setValueForMode(lightModeId, 4);
  spaceSmall.setValueForMode(darkModeId, 4);

  const spaceMedium = figma.variables.createVariable('space/medium', collection, 'FLOAT');
  spaceMedium.setValueForMode(lightModeId, 8);
  spaceMedium.setValueForMode(darkModeId, 8);

  const radiusButton = figma.variables.createVariable('radius/button', collection, 'FLOAT');
  radiusButton.scopes = ['CORNER_RADIUS'];
  radiusButton.setValueForMode(lightModeId, 8);
  radiusButton.setValueForMode(darkModeId, 8);

  const textEnabled = figma.variables.createVariable('text/enabled', collection, 'BOOLEAN');
  textEnabled.setValueForMode(lightModeId, true);
  textEnabled.setValueForMode(darkModeId, true);

  const brandName = figma.variables.createVariable('brand/name', collection, 'STRING');
  brandName.setValueForMode(lightModeId, 'Base');
  brandName.setValueForMode(darkModeId, 'Base');

  figma.notify(`Built "${PARENT_NAME}" with 2 modes + 9 variables. See README.md for the next (manual) step.`, {
    timeout: 6000,
  });
  figma.closePlugin();
}

// Chunk long console output — some consoles truncate very long single lines.
function logChunked(label, text) {
  const CHUNK = 1500;
  console.log(`FIXTURE_DUMP_START:${label}`);
  for (let i = 0; i < text.length; i += CHUNK) {
    console.log(text.slice(i, i + CHUNK));
  }
  console.log(`FIXTURE_DUMP_END:${label}`);
}

async function dump() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();

  const collectionDump = collections.map((c) => {
    // Feature-detect extension fields — these are what issue #88 needs confirmed live;
    // they may not exist on this API version/plan, in which case they'll just be undefined.
    const base = {
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({
        modeId: m.modeId,
        name: m.name,
        parentModeId: m.parentModeId,
      })),
      variableIds: c.variableIds,
    };
    const extensionFields = {
      isExtension: c.isExtension,
      parentVariableCollectionId: c.parentVariableCollectionId,
      rootVariableCollectionId: c.rootVariableCollectionId,
      variableOverrides: c.variableOverrides,
    };
    return Object.assign(base, extensionFields);
  });

  const variableDump = variables.map((v) => ({
    id: v.id,
    name: v.name,
    variableCollectionId: v.variableCollectionId,
    resolvedType: v.resolvedType,
    scopes: v.scopes,
    valuesByMode: v.valuesByMode,
  }));

  const payload = JSON.stringify({ collections: collectionDump, variables: variableDump }, null, 2);
  logChunked('EXTENDED_COLLECTIONS', payload);

  figma.notify('Dump complete — open the console (Plugins → Development → Open Console) and copy everything between the START/END markers.', { timeout: 8000 });
  figma.closePlugin();
}

if (figma.command === 'build') {
  build();
} else if (figma.command === 'dump') {
  dump();
} else {
  figma.notify('Run this via its menu commands: "1. Build parent fixture" then "2. Dump collections + variables".');
  figma.closePlugin();
}

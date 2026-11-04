#!/usr/bin/env python3
"""Generate the Xcode project, bundled GLBs, and pinned GLTFKit2 dependency."""
from pathlib import Path, PurePosixPath
import hashlib,re,sys
root=Path(__file__).resolve().parents[1]; app=root/'ios/Braive'; project=root/'ios/Braive.xcodeproj';project.mkdir(exist_ok=True)
def uid(s): return hashlib.sha1(s.encode()).hexdigest()[:24].upper()
existing=(project/'project.pbxproj').read_text() if (project/'project.pbxproj').exists() else ''
team_match=re.search(r'DEVELOPMENT_TEAM\s*=\s*([A-Z0-9]+)',existing)
bundle_match=re.search(r'PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([A-Za-z0-9_.-]+)',existing)
team_setting=f'DEVELOPMENT_TEAM = {team_match[1]}; ' if team_match else ''
bundle=bundle_match[1] if bundle_match else 'edu.uiuc.braive'
objects=[]
def add(name,content): objects.append(f'{uid(name)} = {{ {content} }};');return uid(name)
files=[];sources=[];resources=[]
for path in sorted(app.rglob('*')):
 if not path.is_file():continue
 relative=PurePosixPath(path.relative_to(app).as_posix())
 if any(part.endswith('.xcassets') for part in relative.parts):continue
 if relative.parts[:2] in [('Resources','LowPoly'),('Resources','Textures')]:continue
 if 'Review' in relative.parts and '--include-review' not in sys.argv:continue
 kind='sourcecode.swift' if path.suffix=='.swift' else 'text.plist.xml' if path.suffix=='.plist' else 'sourcecode.metal' if path.suffix=='.metal' else 'text.json' if path.suffix=='.json' else 'file' if path.suffix=='.glb' else 'text' if path.suffix=='.txt' else 'audio.wav'
 ref=add(str(relative),f'isa = PBXFileReference; lastKnownFileType = {kind}; path = "Braive/{relative}"; sourceTree = "<group>";');files.append(ref)
 if path.suffix in ['.swift','.metal','.wav','.json','.glb','.txt']:
  build=add('build'+str(relative),f'isa = PBXBuildFile; fileRef = {ref};');(sources if path.suffix in ['.swift','.metal'] else resources).append(build)
# A blue folder resource preserves category/subcategory paths at runtime.
for catalog in sorted(app.glob('*.xcassets')):
 if not (catalog/'Contents.json').exists():continue
 ref=add(str(catalog.name),f'isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = "Braive/{catalog.name}"; sourceTree = "<group>";')
 files.append(ref);resources.append(add('build'+catalog.name,f'isa = PBXBuildFile; fileRef = {ref};'))
lowpoly=add('lowpolyfolder','isa = PBXFileReference; lastKnownFileType = folder; path = Braive/Resources/LowPoly; sourceTree = "<group>";')
files.append(lowpoly);resources.append(add('lowpolybuild',f'isa = PBXBuildFile; fileRef = {lowpoly};'))
textures=add('texturesfolder','isa = PBXFileReference; lastKnownFileType = folder; path = Braive/Resources/Textures; sourceTree = "<group>";')
files.append(textures);resources.append(add('texturesbuild',f'isa = PBXBuildFile; fileRef = {textures};'))
package=add('gltfpackage','isa = XCRemoteSwiftPackageReference; repositoryURL = "https://github.com/warrenm/GLTFKit2.git"; requirement = { kind = exactVersion; version = 0.5.15; };')
packageProduct=add('gltfproduct',f'isa = XCSwiftPackageProductDependency; package = {package}; productName = GLTFKit2;')
packageBuild=add('gltfbuild',f'isa = PBXBuildFile; productRef = {packageProduct};')
product=add('product','isa = PBXFileReference; explicitFileType = wrapper.application; path = Braive.app; sourceTree = BUILT_PRODUCTS_DIR;')
main=add('main','isa = PBXGroup; children = ('+','.join(files+[uid('products')])+'); sourceTree = "<group>";')
add('products',f'isa = PBXGroup; children = ({product}); name = Products; sourceTree = "<group>";')
for name,kind,entries in [('sources','PBXSourcesBuildPhase',sources),('resources','PBXResourcesBuildPhase',resources),('frameworks','PBXFrameworksBuildPhase',[packageBuild])]:add(name,f'isa = {kind}; buildActionMask = 2147483647; files = ({",".join(entries)}); runOnlyForDeploymentPostprocessing = 0;')
for level in ['project','target']:
 configs=[]
 for config in ['Debug','Release']:
  settings='SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 18.0; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES; '
  if level=='target':settings+=team_setting+f'PRODUCT_BUNDLE_IDENTIFIER = {bundle}; PRODUCT_NAME = Braive; INFOPLIST_FILE = Braive/Info.plist; CODE_SIGN_STYLE = Automatic; TARGETED_DEVICE_FAMILY = 1; SWIFT_STRICT_CONCURRENCY = minimal; ENABLE_DEBUG_DYLIB = NO; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; '
  if level=='target' and (app/'Assets.xcassets/AppIcon.appiconset/Contents.json').exists():settings+='ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; '
  if config=='Debug':settings+='SWIFT_OPTIMIZATION_LEVEL = "-Onone"; DEBUG_INFORMATION_FORMAT = dwarf; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; '
  else:settings+='SWIFT_OPTIMIZATION_LEVEL = "-O"; '
  configs.append(add(level+config,f'isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = {config};'))
 add(level+'configs',f'isa = XCConfigurationList; buildConfigurations = ({",".join(configs)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
add('target',f'isa = PBXNativeTarget; buildConfigurationList = {uid("targetconfigs")}; buildPhases = ({uid("sources")},{uid("frameworks")},{uid("resources")}); buildRules = (); dependencies = (); packageProductDependencies = ({packageProduct}); name = Braive; productName = Braive; productReference = {product}; productType = "com.apple.product-type.application";')
add('project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {uid("projectconfigs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en,Base); mainGroup = {main}; productRefGroup = {uid("products")}; projectDirPath = ""; projectRoot = ""; packageReferences = ({package}); targets = ({uid("target")});')
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {uid("project")}; }}\n')

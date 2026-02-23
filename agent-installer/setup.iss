#define MyAppName "RedlyAgent"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "RedlyEA"

#ifndef SourceDir
  #define SourceDir "C:\\RedlyAgent"
#endif

#ifndef OutputDir
  #define OutputDir "C:\\Temp"
#endif

[Setup]
AppId={{A44A3EF8-5A27-4D21-8AC9-3A7D3881CC20}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=RedlyAgentSetup
Compression=lzma2/fast
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
Name: "{commonappdata}\RedlyAgent"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Run]
Filename: "{app}\bin\node.exe"; Parameters: """{app}\service.js"" install"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; StatusMsg: "Registering Redly Endpoint Agent service..."

[UninstallRun]
Filename: "{app}\bin\node.exe"; Parameters: """{app}\service.js"" uninstall"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\RedlyAgent"

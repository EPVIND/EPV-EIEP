import { type FormEvent, useMemo, useRef, useState } from "react";

interface ApprovedPqr { readonly id: string; readonly number: string; readonly revision: string; }
interface Props {
  readonly projectNumber: string;
  readonly approvedPqrs: readonly ApprovedPqr[];
  readonly working: boolean;
  readonly submit: (body: unknown) => Promise<void>;
}

interface ProcessStep {
  readonly id: number;
  readonly processCode: string;
  readonly operationMode: "manual" | "semiautomatic" | "machine" | "automatic";
  readonly passScope: string;
  readonly transferMode: string;
  readonly currentType: string;
  readonly polarity: string;
  readonly amperageRange: string;
  readonly voltageRange: string;
  readonly travelSpeedRange: string;
  readonly heatInputRange: string;
  readonly fillerSpecification: string;
  readonly fillerClassification: string;
  readonly fillerFNumber: string;
  readonly depositedWeldMetalGroup: string;
  readonly fillerDiameterRange: string;
  readonly electrodeConfiguration: string;
  readonly shieldingGasComposition: string;
  readonly shieldingGasFlowRange: string;
  readonly backingGasComposition: string;
  readonly backingGasFlowRange: string;
  readonly fluxOrBackingMaterial: string;
}

const processCodes = ["SMAW", "GTAW", "GMAW", "FCAW-G", "FCAW-S", "SAW", "PAW", "OFW", "ESW", "EGW", "LBW", "EBW", "STUD", "FRICTION", "THERMIT"] as const;
type OperationMode = ProcessStep["operationMode"];
interface ProcessRule {
  readonly operationModes: readonly OperationMode[];
  readonly transferModes: readonly string[];
  readonly currentTypes: readonly string[];
  readonly polarities: readonly string[];
  readonly fillerSpecifications: readonly string[];
  readonly shieldingGases: readonly string[];
  readonly fluxRequired: boolean;
  readonly dependencySource: string;
}

const noGas = ["Not applicable"] as const;
const arcCurrent = ["DC", "AC"] as const;
const arcPolarity = ["DCEP", "DCEN", "AC"] as const;
const ownerControlledFiller = ["AWS A5 owner-controlled classification", "ISO filler classification", "Owner-controlled specification"] as const;
const processRules: Readonly<Record<(typeof processCodes)[number], ProcessRule>> = {
  SMAW: { operationModes: ["manual"], transferModes: ["Not applicable"], currentTypes: arcCurrent, polarities: arcPolarity, fillerSpecifications: ["ASME SFA-5.1", "ASME SFA-5.4", "ASME SFA-5.5", "ASME SFA-5.11", ...ownerControlledFiller], shieldingGases: noGas, fluxRequired: false, dependencySource: "Selected process → covered electrode catalog" },
  GTAW: { operationModes: ["manual", "semiautomatic", "machine", "automatic"], transferModes: ["Not applicable", "Cold-wire", "Hot-wire", "Pulsed spray", "Owner-controlled mode"], currentTypes: ["DC", "AC", "Pulsed DC", "Controlled waveform"], polarities: ["DCEP", "DCEN", "AC", "Variable polarity"], fillerSpecifications: ["ASME SFA-5.9", "ASME SFA-5.14", "ASME SFA-5.18", "ASME SFA-5.28", "Unassigned / autogenous", ...ownerControlledFiller], shieldingGases: ["Argon", "Helium", "Argon / helium blend", "Argon / hydrogen controlled blend", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → tungsten-arc variable catalog" },
  GMAW: { operationModes: ["semiautomatic", "machine", "automatic"], transferModes: ["Short-circuiting", "Globular", "Spray", "Pulsed spray", "Metal-cored", "Controlled waveform", "Owner-controlled mode"], currentTypes: ["DC", "Pulsed DC", "Controlled waveform"], polarities: ["DCEP", "DCEN", "Variable polarity"], fillerSpecifications: ["ASME SFA-5.9", "ASME SFA-5.18", "ASME SFA-5.28", "ASME SFA-5.30", ...ownerControlledFiller], shieldingGases: ["Argon / carbon dioxide blend", "Carbon dioxide", "Argon / oxygen blend", "Argon / helium blend", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → gas-metal-arc transfer catalog" },
  "FCAW-G": { operationModes: ["semiautomatic", "machine", "automatic"], transferModes: ["Not applicable", "Globular", "Spray", "Pulsed spray", "Controlled waveform"], currentTypes: ["DC", "Pulsed DC"], polarities: ["DCEP", "DCEN"], fillerSpecifications: ["ASME SFA-5.20", "ASME SFA-5.22", "ASME SFA-5.29", ...ownerControlledFiller], shieldingGases: ["Argon / carbon dioxide blend", "Carbon dioxide", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → gas-shielded flux-core catalog" },
  "FCAW-S": { operationModes: ["semiautomatic", "machine", "automatic"], transferModes: ["Not applicable", "Controlled waveform"], currentTypes: ["DC"], polarities: ["DCEP", "DCEN"], fillerSpecifications: ["ASME SFA-5.20", "ASME SFA-5.29", ...ownerControlledFiller], shieldingGases: noGas, fluxRequired: false, dependencySource: "Selected process → self-shielded flux-core catalog" },
  SAW: { operationModes: ["machine", "automatic"], transferModes: ["Not applicable", "Cold-wire", "Hot-wire", "Controlled waveform"], currentTypes: ["DC", "AC", "Controlled waveform"], polarities: ["DCEP", "DCEN", "AC", "Variable polarity"], fillerSpecifications: ["ASME SFA-5.17", "ASME SFA-5.23", ...ownerControlledFiller], shieldingGases: noGas, fluxRequired: true, dependencySource: "Selected process → submerged-arc wire/flux catalog" },
  PAW: { operationModes: ["manual", "semiautomatic", "machine", "automatic"], transferModes: ["Not applicable", "Cold-wire", "Hot-wire", "Pulsed spray"], currentTypes: ["DC", "AC", "Pulsed DC"], polarities: ["DCEP", "DCEN", "AC", "Variable polarity"], fillerSpecifications: ["ASME SFA-5.9", "ASME SFA-5.14", "ASME SFA-5.18", "Unassigned / autogenous", ...ownerControlledFiller], shieldingGases: ["Argon", "Helium", "Argon / helium blend", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → plasma-arc variable catalog" },
  OFW: { operationModes: ["manual", "machine", "automatic"], transferModes: ["Not applicable"], currentTypes: ["Not applicable"], polarities: ["Not applicable"], fillerSpecifications: ["ASME SFA-5.2", "ASME SFA-5.9", "Unassigned / autogenous", ...ownerControlledFiller], shieldingGases: ["Oxygen / fuel-gas system", "Owner-controlled fuel-gas system"], fluxRequired: false, dependencySource: "Selected process → oxyfuel variable catalog" },
  ESW: { operationModes: ["machine", "automatic"], transferModes: ["Not applicable", "Controlled waveform"], currentTypes: arcCurrent, polarities: arcPolarity, fillerSpecifications: ["ASME SFA-5.25", ...ownerControlledFiller], shieldingGases: noGas, fluxRequired: true, dependencySource: "Selected process → electroslag wire/flux catalog" },
  EGW: { operationModes: ["machine", "automatic"], transferModes: ["Globular", "Spray", "Controlled waveform"], currentTypes: ["DC"], polarities: ["DCEP", "DCEN"], fillerSpecifications: ["ASME SFA-5.26", ...ownerControlledFiller], shieldingGases: ["Carbon dioxide", "Argon / carbon dioxide blend", "Not applicable", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → electrogas variable catalog" },
  LBW: { operationModes: ["machine", "automatic"], transferModes: ["Not applicable", "Cold-wire", "Hot-wire"], currentTypes: ["Not applicable"], polarities: ["Not applicable"], fillerSpecifications: ["Unassigned / autogenous", ...ownerControlledFiller], shieldingGases: ["Argon", "Helium", "Nitrogen", "Not applicable", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → beam-welding variable catalog" },
  EBW: { operationModes: ["machine", "automatic"], transferModes: ["Not applicable"], currentTypes: ["Not applicable"], polarities: ["Not applicable"], fillerSpecifications: ["Unassigned / autogenous", ...ownerControlledFiller], shieldingGases: noGas, fluxRequired: false, dependencySource: "Selected process → electron-beam variable catalog" },
  STUD: { operationModes: ["semiautomatic", "machine", "automatic"], transferModes: ["Not applicable"], currentTypes: ["DC", "AC"], polarities: arcPolarity, fillerSpecifications: ["Owner-controlled stud classification", ...ownerControlledFiller], shieldingGases: ["Not applicable", "Ceramic ferrule", "Owner-controlled shielding system"], fluxRequired: false, dependencySource: "Selected process → stud/ferrule catalog" },
  FRICTION: { operationModes: ["machine", "automatic"], transferModes: ["Not applicable"], currentTypes: ["Not applicable"], polarities: ["Not applicable"], fillerSpecifications: ["Unassigned / autogenous", "Owner-controlled specification"], shieldingGases: ["Not applicable", "Owner-controlled shielding gas"], fluxRequired: false, dependencySource: "Selected process → friction-welding variable catalog" },
  THERMIT: { operationModes: ["manual", "machine"], transferModes: ["Not applicable"], currentTypes: ["Not applicable"], polarities: ["Not applicable"], fillerSpecifications: ["Owner-controlled thermit charge", "Owner-controlled specification"], shieldingGases: noGas, fluxRequired: true, dependencySource: "Selected process → thermit charge/mold catalog" },
};

const codeProfiles = [
  { id: "ASME_BPVC_IX_2025", code: "ASME BPVC Section IX", edition: "2025", construction: ["ASME B31.1", "ASME B31.3", "ASME B31.4", "ASME B31.8", "ASME BPVC Section I", "ASME BPVC Section VIII Division 1", "Project specification"], qualificationRoutes: ["procedure_qualification", "standard_wps", "project_specific"], processes: processCodes, groupSystem: "ASME P-Number / Group Number", groups: ["P-1", "P-3", "P-4", "P-5A", "P-5B", "P-5C", "P-6", "P-7", "P-8", "P-9A", "P-9B", "P-10", "P-11A", "P-11B", "P-15E", "P-21–P-26", "P-31–P-35", "P-41–P-49", "P-51–P-53", "P-61–P-62", "Owner-controlled grouping"] },
  { id: "AWS_D1_1_2025_AMD1", code: "AWS D1.1/D1.1M", edition: "2025-AMD1", construction: ["AWS D1.1 structural steel", "AISC project specification", "Bridge / transportation specification", "Project specification"], qualificationRoutes: ["prequalified", "procedure_qualification", "standard_wps", "project_specific"], processes: ["SMAW", "GTAW", "GMAW", "FCAW-G", "FCAW-S", "SAW", "ESW", "EGW", "STUD"], groupSystem: "AWS D1.1 base-metal grouping", groups: ["Group I", "Group II", "Group III", "Group IV", "Group V", "Owner-controlled grouping"] },
  { id: "API_1104_ED22", code: "API Standard 1104", edition: "22nd Edition", construction: ["Pipeline construction", "Pipeline in-service repair", "Pipeline facility", "Project specification"], qualificationRoutes: ["procedure_qualification", "project_specific"], processes: ["SMAW", "GTAW", "GMAW", "FCAW-G", "FCAW-S", "SAW", "PAW", "OFW"], groupSystem: "API 1104 material grouping", groups: ["SMYS group A", "SMYS group B", "SMYS group C", "Chemistry-based project group", "Owner-controlled grouping"] },
  { id: "ISO_15609_15614", code: "ISO 15609-1 / ISO 15614-1", edition: "Owner-controlled edition", construction: ["EN / ISO pressure equipment", "EN 1090 structural execution", "Project specification"], qualificationRoutes: ["procedure_qualification", "standard_wps", "project_specific"], processes: processCodes, groupSystem: "ISO/TR 15608 material group", groups: ["Group 1", "Group 2", "Group 3", "Group 4", "Group 5", "Group 6", "Group 7", "Group 8", "Group 9", "Group 10", "Group 11", "Group 21–26", "Group 31–38", "Group 41–48", "Group 51–53", "Group 61–62", "Group 71–76", "Owner-controlled grouping"] },
  { id: "CONTROLLED_PROJECT_PROFILE", code: "Controlled project welding profile", edition: "Owner-controlled revision", construction: ["Client specification", "Jurisdictional code", "Manufacturer standard", "Engineered project profile"], qualificationRoutes: ["procedure_qualification", "prequalified", "standard_wps", "project_specific"], processes: processCodes, groupSystem: "Owner-controlled material grouping", groups: ["Owner-controlled grouping"] },
] as const;

const qualificationRouteLabels: Readonly<Record<string, string>> = { procedure_qualification: "Procedure qualification", prequalified: "Prequalified route", standard_wps: "Standard WPS adoption", project_specific: "Project-specific qualification" };
const jointTypes = ["Square butt", "Single-V groove", "Double-V groove", "Single-bevel groove", "Double-bevel groove", "Single-U groove", "Double-U groove", "Single-J groove", "Double-J groove", "Fillet / T-joint", "Lap joint", "Corner joint", "Socket weld", "Branch connection", "Tube-to-tubesheet", "Overlay / cladding", "Build-up / repair"] as const;
const positions = ["1G", "2G", "3G", "4G", "5G", "6G", "6GR", "1F", "2F", "3F", "4F", "5F", "2FR", "Vertical up", "Vertical down", "All qualified positions"] as const;
const productForms = ["Plate", "Pipe", "Tube", "Fitting", "Flange", "Forging", "Casting", "Structural shape", "Sheet", "Bar", "Branch fitting", "Dissimilar product forms"] as const;
const ndeMethods = ["VT", "PT", "MT", "RT", "UT", "PAUT", "TOFD", "LT", "ET", "PMI", "Hardness", "Ferrite", "Owner-controlled examination"] as const;
const mechanicalTests = ["Tension", "Face bend", "Root bend", "Side bend", "Guided bend", "Charpy V-notch", "Nick-break", "Fillet-break", "Macro examination", "Hardness survey", "Fracture toughness", "Corrosion test", "Ferrite", "Chemical analysis"] as const;
const routeEvidence: Readonly<Record<string, readonly string[]>> = {
  procedure_qualification: mechanicalTests,
  prequalified: ["Prequalification eligibility record", "Project-specified supplementary test", "Owner-controlled evidence"],
  standard_wps: ["Standard WPS adoption record", "Applicability comparison", "Project-specified supplementary test", "Owner-controlled evidence"],
  project_specific: [...mechanicalTests, "Project-specific demonstration", "Owner-controlled evidence"],
};

const fillerClassifications: Readonly<Record<string, readonly string[]>> = {
  "ASME SFA-5.1": ["E6010", "E6011", "E6012", "E6013", "E7014", "E7015", "E7016", "E7018", "E7024", "Owner-controlled classification"],
  "ASME SFA-5.2": ["R45", "R60", "R65", "RG45", "RG60", "RG65", "Owner-controlled classification"],
  "ASME SFA-5.4": ["E308-15", "E308-16", "E308L-15", "E308L-16", "E309L-15", "E309L-16", "E316L-15", "E316L-16", "E347-15", "E347-16", "Owner-controlled classification"],
  "ASME SFA-5.5": ["E7018-A1", "E8018-B2", "E9018-B3", "E8018-C1", "E8018-C2", "E8018-C3", "E9018-M", "E10018-M", "E11018-M", "Owner-controlled classification"],
  "ASME SFA-5.9": ["ER308", "ER308L", "ER309", "ER309L", "ER316", "ER316L", "ER317L", "ER321", "ER347", "ER410", "ER430", "Owner-controlled classification"],
  "ASME SFA-5.11": ["ENiCrFe-2", "ENiCrFe-3", "ENiCrMo-3", "ENiCrMo-4", "ENiCrMo-10", "ENiCrCoMo-1", "ENiCu-7", "Owner-controlled classification"],
  "ASME SFA-5.14": ["ERNiCr-3", "ERNiCrMo-3", "ERNiCrMo-4", "ERNiCrMo-10", "ERNiCrCoMo-1", "ERNiCu-7", "Owner-controlled classification"],
  "ASME SFA-5.17": ["EL8", "EL12", "EM12", "EM12K", "EH14", "Owner-controlled wire/flux classification"],
  "ASME SFA-5.18": ["ER70S-2", "ER70S-3", "ER70S-4", "ER70S-6", "ER70S-7", "ER70S-G", "E70C-6M", "Owner-controlled classification"],
  "ASME SFA-5.20": ["E70T-4", "E70T-6", "E70T-7", "E71T-1C", "E71T-1M", "E71T-8", "E71T-9C", "E71T-9M", "E71T-11", "Owner-controlled classification"],
  "ASME SFA-5.22": ["E308LT1-1", "E308LT1-4", "E309LT1-1", "E309LT1-4", "E316LT1-1", "E316LT1-4", "E347T1-1", "E347T1-4", "Owner-controlled classification"],
  "ASME SFA-5.23": ["EA2", "EA3", "EB2", "EB3", "ECrMo1", "ENi1", "ENi2", "Owner-controlled wire/flux classification"],
  "ASME SFA-5.28": ["ER80S-B2", "ER90S-B3", "ER80S-D2", "ER80S-Ni1", "ER80S-Ni2", "ER80S-Ni3", "ER90S-G", "ER100S-G", "ER110S-G", "Owner-controlled classification"],
  "ASME SFA-5.29": ["E81T1-B2", "E91T1-B3", "E81T1-Ni1", "E81T1-Ni2", "E91T1-G", "E101T1-G", "Owner-controlled classification"],
  "ASME SFA-5.30": ["Consumable insert — class per controlled catalog", "Owner-controlled classification"],
  "Unassigned / autogenous": ["Not applicable — autogenous", "Unassigned by governing edition"],
};

const defaultFillerClassifications = ["Owner-controlled classification from released catalog", "Unassigned by governing edition"] as const;
const asmeFNumbers = ["F-No. 1", "F-No. 2", "F-No. 3", "F-No. 4", "F-No. 5", "F-No. 6", "F-No. 21", "F-No. 22", "F-No. 23", "F-No. 24", "F-No. 31", "F-No. 32", "F-No. 33", "F-No. 34", "F-No. 35", "F-No. 36", "F-No. 37", "F-No. 41", "F-No. 42", "F-No. 43", "F-No. 44", "F-No. 45", "F-No. 46", "Not applicable / unassigned", "Owner-controlled F-number"] as const;
const asmeANumbers = ["A-No. 1", "A-No. 2", "A-No. 3", "A-No. 4", "A-No. 5", "A-No. 6", "A-No. 7", "A-No. 8", "A-No. 9", "A-No. 10", "A-No. 11", "A-No. 12", "Not applicable — nonferrous/autogenous", "Owner-controlled chemistry group"] as const;
const asmeFNumbersBySpecification: Readonly<Record<string, readonly string[]>> = {
  "ASME SFA-5.1": ["F-No. 1", "F-No. 2", "F-No. 3", "F-No. 4"],
  "ASME SFA-5.2": ["F-No. 6"], "ASME SFA-5.4": ["F-No. 5"], "ASME SFA-5.5": ["F-No. 4"],
  "ASME SFA-5.9": ["F-No. 6"], "ASME SFA-5.11": ["F-No. 43"], "ASME SFA-5.14": ["F-No. 43"],
  "ASME SFA-5.17": ["F-No. 6"], "ASME SFA-5.18": ["F-No. 6"], "ASME SFA-5.20": ["F-No. 6"],
  "ASME SFA-5.22": ["F-No. 6"], "ASME SFA-5.23": ["F-No. 6"], "ASME SFA-5.28": ["F-No. 6"],
  "ASME SFA-5.29": ["F-No. 6"], "ASME SFA-5.30": ["Not applicable / unassigned"],
  "Unassigned / autogenous": ["Not applicable / unassigned"],
};
const isoFillerGroups = ["FM 1", "FM 2", "FM 3", "FM 4", "FM 5", "FM 6", "FM 7", "FM 8", "FM 9", "FM 10", "Owner-controlled ISO filler group"] as const;
const classificationOnlyGroup = ["Not applicable — classification controls", "Owner-controlled filler grouping"] as const;
const temperaturePresets = {
  us_customary: ["32", "50", "70", "100", "150", "200", "250", "300", "350", "400", "450", "500", "600", "700"],
  metric: ["0", "10", "20", "40", "65", "95", "120", "150", "175", "200", "230", "260", "315", "370"],
  mixed: ["32", "50", "70", "100", "150", "200", "250", "300", "350", "400", "450", "500", "600", "700"],
} as const;
const dimensionPresets = {
  us_customary: ["0", "0.0625", "0.125", "0.1875", "0.25", "0.3125", "0.375", "0.5", "0.625", "0.75", "1", "1.25", "1.5", "2", "2.5", "3", "4", "6", "8", "12", "24", "48"],
  metric: ["0", "1", "1.5", "2", "3", "4", "5", "6", "8", "10", "12", "16", "20", "25", "32", "40", "50", "65", "75", "100", "150", "200", "300", "600", "1000"],
  mixed: ["0", "0.0625", "0.125", "0.1875", "0.25", "0.3125", "0.375", "0.5", "0.625", "0.75", "1", "1.25", "1.5", "2", "2.5", "3", "4", "6", "8", "12", "24", "48"],
} as const;
const interpassCleaningOptions = ["Power wire brush", "Grinding", "Chipping / slag removal", "Power wire brush and grinding", "Chipping, wire brush, and grinding", "Machining", "Solvent cleaning followed by mechanical cleaning", "No interpass cleaning — qualified autogenous sequence", "Owner-controlled cleaning sequence"] as const;

interface FillerGroupCatalog {
  readonly fNumbers: readonly string[];
  readonly depositedGroups: readonly string[];
  readonly labels: readonly [string, string];
}

function fillerGroupOptions(profileId: string): FillerGroupCatalog {
  if (profileId === "ASME_BPVC_IX_2025") return { fNumbers: asmeFNumbers, depositedGroups: asmeANumbers, labels: ["F-number", "A-number / deposited weld-metal group"] as const };
  if (profileId === "ISO_15609_15614") return { fNumbers: isoFillerGroups, depositedGroups: isoFillerGroups, labels: ["ISO filler material group", "ISO deposited weld-metal group"] as const };
  return { fNumbers: classificationOnlyGroup, depositedGroups: classificationOnlyGroup, labels: ["Filler grouping basis", "Deposited weld-metal grouping"] as const };
}

function fillerFNumberOptions(profileId: string, specification: string): readonly string[] {
  const profileGroups = fillerGroupOptions(profileId).fNumbers;
  if (profileId !== "ASME_BPVC_IX_2025" || !specification) return profileGroups;
  if (specification.includes("owner-controlled") || specification === "Owner-controlled specification") return ["Owner-controlled F-number"];
  return asmeFNumbersBySpecification[specification] ?? profileGroups;
}

function blankStep(id: number): ProcessStep {
  return { id, processCode: "", operationMode: "manual", passScope: "", transferMode: "Not applicable", currentType: "DC", polarity: "DCEP",
    amperageRange: "", voltageRange: "", travelSpeedRange: "", heatInputRange: "", fillerSpecification: "", fillerClassification: "",
    fillerFNumber: "", depositedWeldMetalGroup: "", fillerDiameterRange: "", electrodeConfiguration: "Single electrode", shieldingGasComposition: "Not applicable",
    shieldingGasFlowRange: "Not applicable", backingGasComposition: "Not applicable", backingGasFlowRange: "Not applicable", fluxOrBackingMaterial: "Not applicable" };
}

const split = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
const selectedValues = (form: FormData, name: string) => form.getAll(name).map(String).filter(Boolean);
const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const escapeHtml = (input: string) => input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function WeldingProcedureBuilder({ projectNumber, approvedPqrs, working, submit }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [profileId, setProfileId] = useState(codeProfiles[0].id);
  const [procedureType, setProcedureType] = useState<"wps" | "pqr">("wps");
  const [constructionCode, setConstructionCode] = useState("");
  const [qualificationRoute, setQualificationRoute] = useState<string>(codeProfiles[0].qualificationRoutes[0]);
  const [units, setUnits] = useState<keyof typeof dimensionPresets>("us_customary");
  const [jointType, setJointType] = useState("");
  const [grooveAngle, setGrooveAngle] = useState("");
  const [rootOpening, setRootOpening] = useState("");
  const [rootFace, setRootFace] = useState("");
  const [backingType, setBackingType] = useState("None");
  const [backingMaterial, setBackingMaterial] = useState("Not applicable");
  const [selectedMaterialGroups, setSelectedMaterialGroups] = useState<readonly string[]>([]);
  const [selectedProductForms, setSelectedProductForms] = useState<readonly string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<readonly string[]>([]);
  const [thicknessMinimum, setThicknessMinimum] = useState("");
  const [thicknessMaximum, setThicknessMaximum] = useState("");
  const [pwhtDetermination, setPwhtDetermination] = useState<"" | "required" | "not_required" | "engineering_review">("");
  const [pwhtRequired, setPwhtRequired] = useState(false);
  const [pwhtTemperatureRange, setPwhtTemperatureRange] = useState("Not applicable");
  const [pwhtHoldingTime, setPwhtHoldingTime] = useState("Not applicable");
  const [heatingRateLimit, setHeatingRateLimit] = useState("Not applicable");
  const [coolingRateLimit, setCoolingRateLimit] = useState("Not applicable");
  const [steps, setSteps] = useState<readonly ProcessStep[]>([blankStep(1)]);
  const [message, setMessage] = useState("Choose the exact code profile and complete each controlled variable group.");
  const profile = codeProfiles.find((item) => item.id === profileId) ?? codeProfiles[0];
  const jointRequiresGroove = jointType !== "" && !["Fillet / T-joint", "Lap joint", "Corner joint", "Socket weld", "Overlay / cladding", "Build-up / repair"].includes(jointType);
  const tubularProductSelected = selectedProductForms.some((item) => ["Pipe", "Tube", "Fitting", "Flange", "Casting", "Branch fitting", "Dissimilar product forms"].includes(item));
  const availablePositions = useMemo(() => tubularProductSelected ? positions : positions.filter((item) => !["5G", "6G", "6GR", "5F", "2FR", "Uphill pipeline", "Downhill pipeline", "Orbital progression"].includes(item)), [tubularProductSelected]);
  const mechanicalTestOptions = routeEvidence[qualificationRoute] ?? routeEvidence.project_specific ?? [];
  const activeFillerGroups = fillerGroupOptions(profile.id);
  const activeDimensionPresets = dimensionPresets[units];
  const activeTemperaturePresets = temperaturePresets[units];
  const dimensionUnit = units === "metric" ? "mm" : units === "mixed" ? "declared units" : "in";
  const temperatureUnit = units === "metric" ? "°C" : units === "mixed" ? "declared units" : "°F";
  const completedSteps = useMemo(() => steps.filter((step) => step.processCode && step.passScope && step.amperageRange && step.voltageRange
    && step.travelSpeedRange && step.fillerSpecification && step.fillerClassification).length, [steps]);
  const complianceFindings = useMemo(() => {
    const findings: string[] = [];
    if (!constructionCode) findings.push("Select the application governed by the active code profile.");
    if (!jointType) findings.push("Select a joint design before dependent geometry is accepted.");
    if (selectedMaterialGroups.length === 0) findings.push("Select at least one material group from the active profile.");
    if (selectedProductForms.length === 0) findings.push("Select product form before the qualified-position list is resolved.");
    if (selectedPositions.length === 0) findings.push("Select a position permitted by the product-form branch.");
    if (constructionCode && selectedMaterialGroups.length > 0 && thicknessMaximum && !pwhtDetermination) findings.push("Resolve the construction-code PWHT rule for the selected material group and thickness range.");
    if (pwhtDetermination === "engineering_review") findings.push("PWHT engineering review remains unresolved; record a required/not-required disposition before submission.");
    if (pwhtDetermination === "required" && !pwhtRequired) findings.push("The controlled PWHT disposition requires heat treatment controls.");
    steps.forEach((step, index) => {
      if (!step.processCode) { findings.push(`Process step ${index + 1}: select a process.`); return; }
      if (!profile.processes.some((code) => code === step.processCode)) findings.push(`Process step ${index + 1}: process is not enabled by this controlled profile.`);
      const rule = processRules[step.processCode as keyof typeof processRules];
      if (!rule) { findings.push(`Process step ${index + 1}: no controlled dependency rule is loaded.`); return; }
      if (!rule.operationModes.some((mode) => mode === step.operationMode)) findings.push(`Process step ${index + 1}: operation mode conflicts with the selected process.`);
      if (!rule.transferModes.includes(step.transferMode)) findings.push(`Process step ${index + 1}: transfer mode conflicts with the selected process.`);
      if (!rule.currentTypes.includes(step.currentType)) findings.push(`Process step ${index + 1}: current type conflicts with the selected process.`);
      if (!rule.polarities.includes(step.polarity)) findings.push(`Process step ${index + 1}: polarity conflicts with the selected current/process branch.`);
      if (!rule.fillerSpecifications.includes(step.fillerSpecification)) findings.push(`Process step ${index + 1}: filler specification is outside the selected process catalog.`);
      const classificationOptions = fillerClassifications[step.fillerSpecification] ?? defaultFillerClassifications;
      if (!classificationOptions.includes(step.fillerClassification)) findings.push(`Process step ${index + 1}: filler classification must resolve through the selected specification catalog.`);
      if (!fillerFNumberOptions(profile.id, step.fillerSpecification).includes(step.fillerFNumber)) findings.push(`Process step ${index + 1}: filler grouping is unresolved for the active code profile and filler specification.`);
      if (!activeFillerGroups.depositedGroups.includes(step.depositedWeldMetalGroup)) findings.push(`Process step ${index + 1}: deposited weld-metal grouping is unresolved for the active code profile.`);
      if (!rule.shieldingGases.includes(step.shieldingGasComposition)) findings.push(`Process step ${index + 1}: shielding gas conflicts with the selected process.`);
      if (rule.fluxRequired && step.fluxOrBackingMaterial === "Not applicable") findings.push(`Process step ${index + 1}: the selected process requires a controlled flux/charge/mold entry.`);
      if (backingType === "Gas backing" && step.backingGasComposition === "Not applicable") findings.push(`Process step ${index + 1}: gas backing requires a composition and flow branch.`);
    });
    if (pwhtRequired && [pwhtTemperatureRange, pwhtHoldingTime, heatingRateLimit, coolingRateLimit].some((item) => !item || item === "Not applicable")) findings.push("PWHT is selected; temperature, hold, heating, and cooling controls are required.");
    if (procedureType === "wps" && approvedPqrs.length === 0) findings.push("WPS submission requires an independently approved supporting PQR revision.");
    return findings;
  }, [activeFillerGroups.depositedGroups, approvedPqrs.length, backingType, constructionCode, coolingRateLimit, heatingRateLimit, jointType, procedureType, profile.id, profile.processes, pwhtDetermination, pwhtHoldingTime, pwhtRequired, pwhtTemperatureRange, selectedMaterialGroups.length, selectedPositions.length, selectedProductForms.length, steps, thicknessMaximum]);

  function invalidatePwhtDetermination() {
    setPwhtDetermination("");
    togglePwht(false);
  }

  function updateStep(id: number, field: keyof Omit<ProcessStep, "id">, nextValue: string) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, [field]: nextValue } : step));
  }

  function selectProfile(nextProfileId: typeof profileId) {
    const nextProfile = codeProfiles.find((item) => item.id === nextProfileId) ?? codeProfiles[0];
    setProfileId(nextProfile.id); setConstructionCode(""); setQualificationRoute(nextProfile.qualificationRoutes[0]);
    setSelectedMaterialGroups([]); setSelectedProductForms([]); setSelectedPositions([]);
    setThicknessMinimum(""); setThicknessMaximum(""); invalidatePwhtDetermination();
    setSteps((current) => current.map((step) => nextProfile.processes.some((code) => code === step.processCode) ? step : blankStep(step.id)));
    setMessage(`${nextProfile.code} selected. Downstream application, material, process, and qualification options were re-filtered.`);
  }

  function selectJoint(nextJointType: string) {
    setJointType(nextJointType);
    invalidatePwhtDetermination();
    const usesGrooveVariables = !["Fillet / T-joint", "Lap joint", "Corner joint", "Socket weld", "Overlay / cladding", "Build-up / repair"].includes(nextJointType);
    if (!usesGrooveVariables) { setGrooveAngle("Not applicable"); setRootOpening("Not applicable"); setRootFace("Not applicable"); }
    else { setGrooveAngle((current) => current === "Not applicable" ? "" : current); setRootOpening((current) => current === "Not applicable" ? "" : current); setRootFace((current) => current === "Not applicable" ? "" : current); }
  }

  function selectBacking(nextBackingType: string) {
    setBackingType(nextBackingType);
    setBackingMaterial(nextBackingType === "None" || nextBackingType === "Gas backing" ? "Not applicable" : "");
    if (nextBackingType !== "Gas backing") setSteps((current) => current.map((step) => ({ ...step, backingGasComposition: "Not applicable", backingGasFlowRange: "Not applicable" })));
  }

  function selectProductForms(element: HTMLSelectElement) {
    const nextForms = [...element.selectedOptions].map((option) => option.value);
    setSelectedProductForms(nextForms); setSelectedPositions([]);
  }

  function selectMaterialGroups(element: HTMLSelectElement) {
    setSelectedMaterialGroups([...element.selectedOptions].map((option) => option.value));
    invalidatePwhtDetermination();
  }

  function selectPwhtDetermination(nextDetermination: typeof pwhtDetermination) {
    setPwhtDetermination(nextDetermination);
    togglePwht(nextDetermination === "required");
    setMessage(nextDetermination === "required"
      ? "PWHT is mandatory for the selected controlled rule disposition; thermal-cycle fields are now required."
      : nextDetermination === "not_required"
        ? "PWHT is not required by the cited controlled rule. Any parent material, thickness, joint, or construction-code change will invalidate this decision."
        : "PWHT disposition requires welding-engineering resolution before procedure submission.");
  }

  function selectProcess(id: number, processCode: string) {
    const rule = processRules[processCode as keyof typeof processRules];
    if (!rule) { updateStep(id, "processCode", processCode); return; }
    setSteps((current) => current.map((step) => step.id === id ? { ...step, processCode, operationMode: rule.operationModes[0] ?? "manual",
      transferMode: rule.transferModes[0] ?? "Not applicable", currentType: rule.currentTypes[0] ?? "Not applicable", polarity: rule.polarities[0] ?? "Not applicable",
      fillerSpecification: rule.fillerSpecifications[0] ?? "", fillerClassification: "", fillerFNumber: "", depositedWeldMetalGroup: "", shieldingGasComposition: rule.shieldingGases[0] ?? "Not applicable",
      shieldingGasFlowRange: rule.shieldingGases[0] === "Not applicable" ? "Not applicable" : "", fluxOrBackingMaterial: rule.fluxRequired ? "" : "Not applicable" } : step));
  }

  function selectFillerSpecification(id: number, fillerSpecification: string) {
    const permittedFNumbers = fillerFNumberOptions(profile.id, fillerSpecification);
    setSteps((current) => current.map((step) => step.id === id ? { ...step, fillerSpecification, fillerClassification: "",
      fillerFNumber: permittedFNumbers.length === 1 ? permittedFNumbers[0] ?? "" : "", depositedWeldMetalGroup: "" } : step));
  }

  function togglePwht(nextRequired: boolean) {
    setPwhtRequired(nextRequired);
    if (!nextRequired) { setPwhtTemperatureRange("Not applicable"); setPwhtHoldingTime("Not applicable"); setHeatingRateLimit("Not applicable"); setCoolingRateLimit("Not applicable"); }
    else { setPwhtTemperatureRange(""); setPwhtHoldingTime(""); setHeatingRateLimit(""); setCoolingRateLimit(""); }
  }

  function validate(): boolean {
    const form = formRef.current;
    if (!form?.reportValidity()) { setMessage("Complete every required field in the open code-variable sections."); return false; }
    if (completedSteps !== steps.length) { setMessage("Every process step requires process, pass scope, electrical/travel ranges, and filler identity."); return false; }
    if (complianceFindings.length > 0) { setMessage(`Dependency validation blocked: ${complianceFindings[0]}`); return false; }
    setMessage(`Validation passed for ${steps.length} ordered process step${steps.length === 1 ? "" : "s"}. Code-table acceptance still requires the controlled ${profile.code} profile.`);
    return true;
  }

  function buildBody(form: FormData) {
    const materialGroups = selectedValues(form, "materialGroupCodes");
    const positionCodes = selectedValues(form, "positionCodes");
    const processStepSpecifications = steps.map(({ id: _id, fillerFNumber, depositedWeldMetalGroup, ...step }, index) => ({
      ...step,
      sequence: index + 1,
      fillerGroup: [fillerFNumber, depositedWeldMetalGroup].filter(Boolean).join(" · "),
    }));
    return {
      procedureType, number: value(form, "number"), revision: value(form, "revision"), governingDocumentRevisionId: value(form, "governingDocumentRevisionId"),
      supportingPqrIds: selectedValues(form, "supportingPqrIds"), processCodes: [...new Set(steps.map((step) => step.processCode).filter(Boolean))],
      materialGroupCodes: materialGroups, positionCodes, thicknessMinimum: value(form, "thicknessMinimum"), thicknessMaximum: value(form, "thicknessMaximum"),
      diameterMinimum: value(form, "diameterMinimum"), diameterMaximum: value(form, "diameterMaximum"), jointDesignCodes: [value(form, "jointType")],
      consumableClassifications: [...new Set(steps.map((step) => step.fillerClassification).filter(Boolean))], preheatMinimum: value(form, "preheatMinimum"),
      interpassMaximum: value(form, "interpassMaximum"), effectiveFrom: value(form, "effectiveFrom"), effectiveTo: value(form, "effectiveTo") || null,
      supersedesRevisionId: value(form, "supersedesRevisionId") || null,
      specification: {
        codeProfileId: profile.id, governingCode: profile.code, codeEdition: profile.edition, constructionCode: value(form, "constructionCode"),
        controlledCatalogVersion: value(form, "catalogVersion"), qualificationRoute: value(form, "qualificationRoute"), procedureTitle: value(form, "procedureTitle"),
        serviceDescription: value(form, "serviceDescription"), units: value(form, "units"),
        joint: { jointType: value(form, "jointType"), designReference: value(form, "designReference"), grooveAngle: value(form, "grooveAngle"),
          rootOpening: value(form, "rootOpening"), rootFace: value(form, "rootFace"), backingType: value(form, "backingType"), backingMaterial: value(form, "backingMaterial"),
          weldProgression: value(form, "weldProgression"), misalignmentTolerance: value(form, "misalignmentTolerance") },
        baseMetals: { materialSpecifications: split(form.get("materialSpecifications")), materialGrades: split(form.get("materialGrades")),
          groupSystem: profile.groupSystem, groupCodes: materialGroups, productForms: selectedValues(form, "productForms"),
          thicknessRange: `${value(form, "thicknessMinimum")} – ${value(form, "thicknessMaximum")}`, diameterRange: `${value(form, "diameterMinimum")} – ${value(form, "diameterMaximum")}`,
          qualificationRangeBasis: value(form, "qualificationRangeBasis"), dissimilarMetalBasis: value(form, "dissimilarMetalBasis") },
        processSteps: processStepSpecifications,
        thermalControl: { preheatMethod: value(form, "preheatMethod"), preheatMaintenance: value(form, "preheatMaintenance"), temperatureMeasurementMethod: value(form, "temperatureMeasurementMethod"),
          temperatureControlBasis: value(form, "temperatureControlBasis"), pwhtDetermination, pwhtRuleCitation: value(form, "pwhtRuleCitation"),
          pwhtRequired, pwhtTemperatureRange: value(form, "pwhtTemperatureRange"), pwhtHoldingTime: value(form, "pwhtHoldingTime"),
          heatingRateLimit: value(form, "heatingRateLimit"), coolingRateLimit: value(form, "coolingRateLimit") },
        technique: { beadTechnique: value(form, "beadTechnique"), cleaningMethod: value(form, "cleaningMethod"), backGougingMethod: value(form, "backGougingMethod"),
          oscillation: value(form, "oscillation"), peening: value(form, "peening"), contactTubeDistance: value(form, "contactTubeDistance"), interpassCleaning: value(form, "interpassCleaning"),
          singleOrMultiplePass: value(form, "singleOrMultiplePass"), singleOrMultipleElectrode: value(form, "singleOrMultipleElectrode") },
        examinationAndTests: { visualAcceptanceReference: value(form, "visualAcceptanceReference"), ndeMethods: selectedValues(form, "ndeMethods"),
          mechanicalTests: selectedValues(form, "mechanicalTests"), impactTestTemperature: value(form, "impactTestTemperature"), hardnessLimit: value(form, "hardnessLimit"),
          macroOrFractureTests: selectedValues(form, "macroOrFractureTests"), specimenReferences: split(form.get("specimenReferences")), essentialVariableNotes: value(form, "essentialVariableNotes") },
        revisionReason: value(form, "revisionReason"),
      },
    };
  }

  async function submitBuilder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    await submit(buildBody(new FormData(event.currentTarget)));
  }

  function openPreview() {
    if (!formRef.current || !validate()) return;
    const form = new FormData(formRef.current);
    const body = buildBody(form);
    const rows = [...form.entries()].filter(([name]) => !["materialGroupCodes", "positionCodes", "productForms", "ndeMethods", "mechanicalTests", "macroOrFractureTests", "supportingPqrIds"].includes(name))
      .map(([name, entry]) => `<tr><th>${escapeHtml(name.replaceAll(/([A-Z])/gu, " $1"))}</th><td>${escapeHtml(String(entry))}</td></tr>`).join("");
    const processes = body.specification.processSteps.map((step, index) => `<tr><th>Process ${index + 1}</th><td>${escapeHtml(step.processCode)} · ${escapeHtml(step.passScope)} · ${escapeHtml(step.fillerClassification)} · ${escapeHtml(step.amperageRange)} A · ${escapeHtml(step.voltageRange)} V</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Welding Procedure Builder</title><style>body{font:14px/1.45 Arial;color:#173e45;max-width:1050px;margin:auto;padding:32px}header{border-bottom:4px solid #0a6669}h1{margin:.2rem 0}.notice{border-left:5px solid #d1832d;background:#fff4df;padding:12px 16px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccdcd9;padding:9px;text-align:left}th{width:30%;background:#edf7f4}</style></head><body><header><p>EPV EIEP · ${escapeHtml(projectNumber)} · WELDING PROCEDURE BUILDER</p><h1>${escapeHtml(value(form, "number"))} revision ${escapeHtml(value(form, "revision"))}</h1><p>${escapeHtml(body.specification.governingCode)} · ${escapeHtml(body.specification.codeEdition)}</p></header><div class="notice"><strong>CONTROLLED PILOT DRAFT</strong><p>Code-table acceptance and approval require the licensed, owner-approved code profile and an independent welding authority.</p></div><table>${rows}${processes}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <section id="welding-procedure-builder" className="welding-procedure-builder" aria-labelledby="wps-builder-heading">
    <div className="workflow-heading"><div><p className="section-label">Code-profile-driven authoring</p><h2 id="wps-builder-heading">Welding Procedure Builder</h2>
      <p>Build the complete procedure-variable package, validate governed ranges, preview the WPS/PQR, and submit the exact revision for independent welding-authority review.</p></div>
      <span className="review-mode-chip">Controlled pilot · code profile required</span></div>
    <div className="builder-metrics"><article><span>Code profile</span><strong>{profile.code}</strong><small>{profile.edition}</small></article>
      <article><span>Process sequence</span><strong>{completedSteps}/{steps.length}</strong><small>Steps complete</small></article>
      <article><span>Approved PQRs</span><strong>{approvedPqrs.length}</strong><small>Exact support records</small></article>
      <article><span>Dependency findings</span><strong>{complianceFindings.length}</strong><small>{complianceFindings.length === 0 ? "Cascade resolved" : "Resolve before submission"}</small></article></div>
    <div className="cascade-path" aria-label="Welding procedure dependency path"><strong>Governed cascade</strong><span>Code profile</span><b>→</b><span>Application & route</span><b>→</b><span>Joint & material</span><b>→</b><span>Process</span><b>→</b><span>Mode / electrical / filler / gas</span><b>→</b><span>Thermal & testing</span></div>

    <form ref={formRef} className="wps-builder-form" onSubmit={(event) => void submitBuilder(event)}>
      <fieldset><legend>01 · Code basis, identity & revision</legend><div className="builder-grid">
        <label>Procedure type<select value={procedureType} onChange={(event) => setProcedureType(event.target.value as "wps" | "pqr")}><option value="wps">Welding Procedure Specification (WPS)</option><option value="pqr">Procedure Qualification Record (PQR)</option></select></label>
        <label>Controlled code profile<small className="dependency-note">Starts every downstream branch</small><select value={profileId} onChange={(event) => selectProfile(event.target.value as typeof profileId)}>{codeProfiles.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.edition}</option>)}</select></label>
        <label>Construction / application code<small className="dependency-note">Filtered by {profile.code}; controls PWHT rule basis</small><select name="constructionCode" required value={constructionCode} onChange={(event) => { setConstructionCode(event.target.value); invalidatePwhtDetermination(); }}><option value="" disabled>Select governed application</option>{profile.construction.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Catalog version<input name="catalogVersion" placeholder="Controlled catalog revision ID" required /></label>
        <label>Procedure number<input name="number" required /></label><label>Revision<input name="revision" required /></label>
        <label className="builder-span">Procedure title<input name="procedureTitle" required /></label>
        <label>Qualification route<small className="dependency-note">Profile-filtered; controls test evidence</small><select name="qualificationRoute" required value={qualificationRoute} onChange={(event) => setQualificationRoute(event.target.value)}>{profile.qualificationRoutes.map((route) => <option key={route} value={route}>{qualificationRouteLabels[route]}</option>)}</select></label>
        <label>Units<small className="dependency-note">Controls dimensional and temperature presets</small><select name="units" value={units} onChange={(event) => { setUnits(event.target.value as keyof typeof dimensionPresets); invalidatePwhtDetermination(); }}><option value="us_customary">US customary</option><option value="metric">Metric / SI</option><option value="mixed">Mixed (explicit per value)</option></select></label>
        <label>Governing released document revision ID<input name="governingDocumentRevisionId" required /></label>
        <label>Supporting approved PQRs<select name="supportingPqrIds" multiple required={procedureType === "wps"}>{approvedPqrs.map((item) => <option key={item.id} value={item.id}>{item.number} · rev {item.revision}</option>)}</select></label>
        <label>Effective from<input name="effectiveFrom" type="date" required /></label><label>Effective to<input name="effectiveTo" type="date" /></label>
        <label>Supersedes revision ID<input name="supersedesRevisionId" /></label><label>Revision reason<input name="revisionReason" required /></label>
        <label className="builder-span">Service / design description<textarea name="serviceDescription" rows={3} required /></label>
      </div></fieldset>

      <fieldset><legend>02 · Joint design & base metals</legend><div className="builder-grid">
        <label>Joint type<small className="dependency-note">Controls groove/root variables</small><select name="jointType" required value={jointType} onChange={(event) => selectJoint(event.target.value)}><option value="" disabled>Select joint/detail</option>{jointTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Detail / drawing reference<input name="designReference" required /></label><label>Groove angle / tolerance<input name="grooveAngle" value={grooveAngle} onChange={(event) => setGrooveAngle(event.target.value)} required readOnly={!jointRequiresGroove} /></label>
        <label>Root opening / tolerance<input name="rootOpening" value={rootOpening} onChange={(event) => setRootOpening(event.target.value)} required readOnly={!jointRequiresGroove} /></label><label>Root face / tolerance<input name="rootFace" value={rootFace} onChange={(event) => setRootFace(event.target.value)} required readOnly={!jointRequiresGroove} /></label>
        <label>Backing type<small className="dependency-note">Controls material or backing-gas branch</small><select name="backingType" required value={backingType} onChange={(event) => selectBacking(event.target.value)}><option>None</option><option>Permanent metal</option><option>Removable metal</option><option>Ceramic</option><option>Flux</option><option>Gas backing</option><option>Weld metal</option><option>Owner-controlled backing</option></select></label>
        <label>Backing material<input name="backingMaterial" required value={backingMaterial} onChange={(event) => setBackingMaterial(event.target.value)} readOnly={backingType === "None" || backingType === "Gas backing"} /></label>
        <label>Weld progression<select name="weldProgression" required><option>Not applicable</option><option>Vertical up</option><option>Vertical down</option><option>Uphill pipeline</option><option>Downhill pipeline</option><option>Orbital progression</option></select></label>
        <label>Misalignment tolerance<input name="misalignmentTolerance" required /></label>
        <label>Material specifications<small className="dependency-note">Changes invalidate PWHT disposition</small><textarea name="materialSpecifications" rows={3} placeholder="One specification per line" onChange={invalidatePwhtDetermination} required /></label>
        <label>Material grades<small className="dependency-note">Changes invalidate PWHT disposition</small><textarea name="materialGrades" rows={3} placeholder="One grade per line" onChange={invalidatePwhtDetermination} required /></label>
        <label>{profile.groupSystem}<small className="dependency-note">Filtered by code profile; changes invalidate PWHT disposition</small><select name="materialGroupCodes" multiple required value={[...selectedMaterialGroups]} onChange={(event) => selectMaterialGroups(event.currentTarget)}>{profile.groups.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Product forms<small className="dependency-note">Controls qualified-position choices</small><select name="productForms" multiple required value={[...selectedProductForms]} onChange={(event) => selectProductForms(event.currentTarget)}>{productForms.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Qualified positions<small className="dependency-note">Filtered by selected product form</small><select name="positionCodes" multiple required value={[...selectedPositions]} onChange={(event) => setSelectedPositions([...event.currentTarget.selectedOptions].map((option) => option.value))}>{availablePositions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Thickness minimum ({dimensionUnit})<small className="dependency-note">Preset or exact supporting-PQR value</small><input aria-label="Thickness minimum" name="thicknessMinimum" type="number" min="0" max={units === "metric" ? "1000" : "48"} step={units === "metric" ? "0.1" : "0.001"} list="wps-dimension-presets" value={thicknessMinimum} onChange={(event) => { setThicknessMinimum(event.target.value); invalidatePwhtDetermination(); }} required /></label><label>Thickness maximum ({dimensionUnit})<small className="dependency-note">Controls the PWHT rule decision</small><input aria-label="Thickness maximum" name="thicknessMaximum" type="number" min="0" max={units === "metric" ? "1000" : "48"} step={units === "metric" ? "0.1" : "0.001"} list="wps-dimension-presets" value={thicknessMaximum} onChange={(event) => { setThicknessMaximum(event.target.value); invalidatePwhtDetermination(); }} required /></label>
        <label>Diameter minimum ({dimensionUnit})<small className="dependency-note">Preset or exact qualified value</small><input aria-label="Diameter minimum" name="diameterMinimum" type="number" min="0" max={units === "metric" ? "3000" : "120"} step={units === "metric" ? "0.1" : "0.001"} list="wps-dimension-presets" required /></label><label>Diameter maximum ({dimensionUnit})<small className="dependency-note">Preset or exact qualified value</small><input aria-label="Diameter maximum" name="diameterMaximum" type="number" min="0" max={units === "metric" ? "3000" : "120"} step={units === "metric" ? "0.1" : "0.001"} list="wps-dimension-presets" required /></label>
        <label>Qualification-range basis<small className="dependency-note">Required source for the entered limits</small><select name="qualificationRangeBasis" required><option>Supporting approved PQR qualified range</option><option>Released prequalified detail / table</option><option>Released standard WPS applicability</option><option>Project-engineered qualification record</option><option>Owner-controlled licensed code evaluation</option></select></label>
        <label className="builder-span">Dissimilar-metal / buttering basis<textarea name="dissimilarMetalBasis" rows={2} required defaultValue="Not applicable" /></label>
        <datalist id="wps-dimension-presets">{activeDimensionPresets.map((item) => <option key={item} value={item} />)}</datalist>
      </div></fieldset>

      <fieldset><legend>03 · Ordered welding processes, filler metals & electrical variables</legend>
        <div className="process-step-list">{steps.map((step, index) => <article key={step.id}><div className="process-step-heading"><strong>Process step {index + 1}</strong>
          <button type="button" className="text-button" disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>Remove</button></div>
          <div className="builder-grid builder-process-grid">
            <label>Process<small className="dependency-note">Filtered by {profile.code}</small><select aria-label={`Process step ${index + 1} process`} value={step.processCode} onChange={(event) => selectProcess(step.id, event.target.value)} required><option value="" disabled>Select process</option>{profile.processes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Operation mode<small className="dependency-note">Process-controlled</small><select aria-label={`Process step ${index + 1} operation mode`} value={step.operationMode} onChange={(event) => updateStep(step.id, "operationMode", event.target.value)} disabled={!step.processCode}>{(processRules[step.processCode as keyof typeof processRules]?.operationModes ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Pass / layer scope<input value={step.passScope} onChange={(event) => updateStep(step.id, "passScope", event.target.value)} placeholder="Root, hot, fill, cap…" required /></label>
            <label>Transfer mode<small className="dependency-note">Process-controlled</small><select aria-label={`Process step ${index + 1} transfer mode`} value={step.transferMode} onChange={(event) => updateStep(step.id, "transferMode", event.target.value)} disabled={!step.processCode}>{(processRules[step.processCode as keyof typeof processRules]?.transferModes ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Current type<small className="dependency-note">Process-controlled</small><select aria-label={`Process step ${index + 1} current type`} value={step.currentType} onChange={(event) => updateStep(step.id, "currentType", event.target.value)} disabled={!step.processCode}>{(processRules[step.processCode as keyof typeof processRules]?.currentTypes ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Polarity<small className="dependency-note">Current/process-controlled</small><select aria-label={`Process step ${index + 1} polarity`} value={step.polarity} onChange={(event) => updateStep(step.id, "polarity", event.target.value)} disabled={!step.processCode}>{(processRules[step.processCode as keyof typeof processRules]?.polarities ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Amperage range<input value={step.amperageRange} onChange={(event) => updateStep(step.id, "amperageRange", event.target.value)} required /></label>
            <label>Voltage range<input value={step.voltageRange} onChange={(event) => updateStep(step.id, "voltageRange", event.target.value)} required /></label>
            <label>Travel-speed range<input value={step.travelSpeedRange} onChange={(event) => updateStep(step.id, "travelSpeedRange", event.target.value)} required /></label>
            <label>Heat-input range<input value={step.heatInputRange} onChange={(event) => updateStep(step.id, "heatInputRange", event.target.value)} required /></label>
            <label>Filler specification<small className="dependency-note">Process-controlled</small><select aria-label={`Process step ${index + 1} filler specification`} value={step.fillerSpecification} onChange={(event) => selectFillerSpecification(step.id, event.target.value)} required disabled={!step.processCode}><option value="" disabled>Select filler specification</option>{(processRules[step.processCode as keyof typeof processRules]?.fillerSpecifications ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Filler classification<small className="dependency-note">Specification-controlled catalog</small><select aria-label={`Process step ${index + 1} filler classification`} value={step.fillerClassification} onChange={(event) => updateStep(step.id, "fillerClassification", event.target.value)} required disabled={!step.fillerSpecification}><option value="" disabled>Select classification</option>{(fillerClassifications[step.fillerSpecification] ?? defaultFillerClassifications).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>{activeFillerGroups.labels[0]}<small className="dependency-note">Filtered by {profile.code} and filler specification</small><select aria-label={`Process step ${index + 1} filler group`} value={step.fillerFNumber} onChange={(event) => updateStep(step.id, "fillerFNumber", event.target.value)} required disabled={!step.fillerClassification}><option value="" disabled>Select grouping</option>{fillerFNumberOptions(profile.id, step.fillerSpecification).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>{activeFillerGroups.labels[1]}<small className="dependency-note">Code/profile-controlled grouping</small><select aria-label={`Process step ${index + 1} deposited weld metal group`} value={step.depositedWeldMetalGroup} onChange={(event) => updateStep(step.id, "depositedWeldMetalGroup", event.target.value)} required disabled={!step.fillerFNumber}><option value="" disabled>Select deposited group</option>{activeFillerGroups.depositedGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Filler diameter range ({dimensionUnit})<small className="dependency-note">Preset or exact manufacturer/catalog range</small><input list="wps-filler-diameter-presets" value={step.fillerDiameterRange} onChange={(event) => updateStep(step.id, "fillerDiameterRange", event.target.value)} required /></label>
            <label>Electrode configuration<select value={step.electrodeConfiguration} onChange={(event) => updateStep(step.id, "electrodeConfiguration", event.target.value)} required><option>Single electrode</option><option>Tandem electrodes</option><option>Multiple electrodes</option><option>Single wire with hot-wire addition</option><option>Consumable insert</option><option>Autogenous / no filler</option><option>Owner-controlled configuration</option></select></label>
            <label>Shielding gas composition<small className="dependency-note">Process-controlled</small><select aria-label={`Process step ${index + 1} shielding gas composition`} value={step.shieldingGasComposition} onChange={(event) => { updateStep(step.id, "shieldingGasComposition", event.target.value); if (event.target.value === "Not applicable") updateStep(step.id, "shieldingGasFlowRange", "Not applicable"); }} required disabled={!step.processCode}>{(processRules[step.processCode as keyof typeof processRules]?.shieldingGases ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Shielding gas flow range<input value={step.shieldingGasFlowRange} onChange={(event) => updateStep(step.id, "shieldingGasFlowRange", event.target.value)} required readOnly={step.shieldingGasComposition === "Not applicable"} /></label>
            <label>Backing gas composition<small className="dependency-note">Enabled by backing type</small><input value={step.backingGasComposition} onChange={(event) => updateStep(step.id, "backingGasComposition", event.target.value)} required readOnly={backingType !== "Gas backing"} /></label>
            <label>Backing gas flow range<input value={step.backingGasFlowRange} onChange={(event) => updateStep(step.id, "backingGasFlowRange", event.target.value)} required readOnly={backingType !== "Gas backing"} /></label>
            <label>Flux / backing material<small className="dependency-note">Required for flux/charge processes</small><input value={step.fluxOrBackingMaterial} onChange={(event) => updateStep(step.id, "fluxOrBackingMaterial", event.target.value)} required readOnly={!processRules[step.processCode as keyof typeof processRules]?.fluxRequired} /></label>
            {step.processCode ? <p className="process-dependency-source">{processRules[step.processCode as keyof typeof processRules]?.dependencySource}</p> : null}
          </div></article>)}</div>
        <datalist id="wps-filler-diameter-presets">{(units === "metric" ? ["0.6", "0.8", "0.9", "1.0", "1.2", "1.6", "2.0", "2.4", "3.2", "4.0", "4.8", "5.0", "6.0"] : ["0.023", "0.030", "0.035", "0.040", "0.045", "0.052", "0.0625", "0.078", "0.093", "0.125", "0.156", "0.1875", "0.25"]).map((item) => <option key={item} value={item} />)}</datalist>
        <button type="button" className="secondary-button" disabled={steps.length >= 12} onClick={() => setSteps((current) => [...current, blankStep(Math.max(...current.map((item) => item.id)) + 1)])}>Add process step</button>
      </fieldset>

      <fieldset><legend>04 · Preheat, interpass, PWHT & technique</legend><div className="builder-grid">
        <label>Preheat minimum ({temperatureUnit})<small className="dependency-note">Preset or exact qualified/project value</small><input aria-label="Preheat minimum" name="preheatMinimum" type="number" min={units === "metric" ? "-50" : "-60"} max={units === "metric" ? "650" : "1200"} step="1" list="wps-temperature-presets" required /></label><label>Interpass maximum ({temperatureUnit})<small className="dependency-note">Bounded by qualified/project limit</small><input aria-label="Interpass maximum" name="interpassMaximum" type="number" min={units === "metric" ? "-50" : "-60"} max={units === "metric" ? "650" : "1200"} step="1" list="wps-temperature-presets" required /></label>
        <label>Temperature-control basis<small className="dependency-note">Explains why the selected limits apply</small><select name="temperatureControlBasis" required><option>Supporting PQR and governing construction specification</option><option>Released prequalified code table and material group</option><option>Hydrogen-control / hardness engineering evaluation</option><option>Client or project specification</option><option>Owner-controlled licensed code evaluation</option></select></label>
        <label>Preheat method<select name="preheatMethod" required><option>Resistance heating</option><option>Induction heating</option><option>Gas torch</option><option>Furnace</option><option>Exothermic / flexible pad</option><option>Not required</option><option>Owner-controlled method</option></select></label>
        <label>Preheat maintenance<select name="preheatMaintenance" required><option>Continuous through welding</option><option>Per-pass verification</option><option>Minimum soak before welding</option><option>Not applicable</option></select></label>
        <label>Temperature measurement<select name="temperatureMeasurementMethod" required><option>Calibrated contact pyrometer</option><option>Calibrated infrared thermometer</option><option>Temperature-indicating crayon</option><option>Thermocouple / recorder</option><option>Owner-controlled method</option></select></label>
        <label>PWHT code-rule disposition<small className="dependency-note">Material + thickness + construction-code decision</small><select aria-label="PWHT code-rule disposition" name="pwhtDetermination" required value={pwhtDetermination} onChange={(event) => selectPwhtDetermination(event.target.value as typeof pwhtDetermination)} disabled={!constructionCode || selectedMaterialGroups.length === 0 || !thicknessMaximum}><option value="" disabled>Resolve applicable rule</option><option value="required">PWHT required by cited controlled rule</option><option value="not_required">PWHT not required by cited controlled rule</option><option value="engineering_review">Engineering review required / unresolved</option></select></label>
        <label>PWHT rule citation<small className="dependency-note">Released code paragraph/table + project exception</small><input name="pwhtRuleCitation" placeholder="Controlled catalog rule ID and released specification revision" required disabled={!pwhtDetermination} /></label>
        <label className="check-row"><input name="pwhtRequired" type="checkbox" checked={pwhtRequired} readOnly disabled />PWHT required — controlled result</label>
        <label>PWHT temperature range<small className="dependency-note">Required when PWHT is selected</small><input name="pwhtTemperatureRange" required value={pwhtTemperatureRange} onChange={(event) => setPwhtTemperatureRange(event.target.value)} readOnly={!pwhtRequired} /></label><label>PWHT holding time<input name="pwhtHoldingTime" required value={pwhtHoldingTime} onChange={(event) => setPwhtHoldingTime(event.target.value)} readOnly={!pwhtRequired} /></label>
        <label>Heating-rate limit<input name="heatingRateLimit" required value={heatingRateLimit} onChange={(event) => setHeatingRateLimit(event.target.value)} readOnly={!pwhtRequired} /></label><label>Cooling-rate limit<input name="coolingRateLimit" required value={coolingRateLimit} onChange={(event) => setCoolingRateLimit(event.target.value)} readOnly={!pwhtRequired} /></label>
        <label>Bead technique<select name="beadTechnique" required><option>Stringer</option><option>Weave</option><option>Stringer or weave within controlled limit</option><option>Mechanized oscillation</option></select></label>
        <label>Single / multiple pass<select name="singleOrMultiplePass"><option>Multiple pass</option><option>Single pass</option><option>Either per qualified range</option></select></label>
        <label>Single / multiple electrode<select name="singleOrMultipleElectrode"><option>Single electrode</option><option>Multiple electrode</option><option>Either per qualified range</option></select></label>
        <label>Cleaning method<select name="cleaningMethod"><option>Power wire brush</option><option>Grinding</option><option>Machining</option><option>Chipping / slag removal</option><option>Solvent cleaning</option><option>Combined controlled cleaning</option></select></label>
        <label>Interpass cleaning<small className="dependency-note">Controlled cleaning sequence</small><select name="interpassCleaning" required>{interpassCleaningOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Back-gouging method<select name="backGougingMethod"><option>Not applicable</option><option>Mechanical grinding</option><option>Air carbon arc</option><option>Plasma gouging</option><option>Machining</option><option>Thermal gouging with MT/PT confirmation</option></select></label>
        <label>Oscillation limits<input name="oscillation" required defaultValue="Not applicable" /></label><label>Peening<select name="peening"><option>Not permitted</option><option>Permitted under controlled limitations</option><option>Not applicable</option></select></label>
        <label>Contact-tube / work distance<input name="contactTubeDistance" required defaultValue="Not applicable" /></label>
        <datalist id="wps-temperature-presets">{activeTemperaturePresets.map((item) => <option key={item} value={item} />)}</datalist>
      </div></fieldset>

      <fieldset><legend>05 · Examination, qualification tests & essential-variable review</legend><div className="builder-grid">
        <label>Visual acceptance reference<input name="visualAcceptanceReference" required /></label>
        <label>NDE methods<select name="ndeMethods" multiple>{ndeMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Qualification evidence / mechanical tests<small className="dependency-note">Filtered by {qualificationRouteLabels[qualificationRoute]}</small><select name="mechanicalTests" multiple>{mechanicalTestOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Macro / fracture tests<select name="macroOrFractureTests" multiple><option>Not required</option><option>Macro examination</option><option>Fillet-weld fracture</option><option>Nick-break</option><option>Production test coupon</option></select></label>
        <label>Impact-test temperature<input name="impactTestTemperature" required defaultValue="Not applicable" /></label><label>Hardness limit<input name="hardnessLimit" required defaultValue="Not applicable" /></label>
        <label className="builder-span">PQR specimen / laboratory references<textarea name="specimenReferences" rows={3} required defaultValue="Pending controlled PQR evidence" /></label>
        <label className="builder-span">Essential, supplementary-essential & nonessential variable notes<textarea name="essentialVariableNotes" rows={5} required /></label>
      </div></fieldset>

      <aside className={`compliance-findings ${complianceFindings.length === 0 ? "is-resolved" : ""}`} aria-live="polite">
        <div><strong>Code-profile dependency review</strong><span>{complianceFindings.length === 0 ? "Resolved for profile review" : `${complianceFindings.length} open finding${complianceFindings.length === 1 ? "" : "s"}`}</span></div>
        {complianceFindings.length === 0 ? <p>Every modeled parent/child selection is internally consistent. Licensed code-table acceptance and welding-authority approval remain separate gates.</p>
          : <ol>{complianceFindings.slice(0, 8).map((finding) => <li key={finding}>{finding}</li>)}{complianceFindings.length > 8 ? <li>{complianceFindings.length - 8} additional findings remain.</li> : null}</ol>}
      </aside>
      <div className="builder-actions"><button type="button" className="secondary-button" onClick={validate}>Validate complete procedure</button>
        <button type="button" onClick={openPreview}>Open WPS/PQR preview</button><button type="submit" className="primary-button" disabled={working}>Submit exact revision for independent review</button></div>
      <p className="review-workbench-message" role="status">{message}</p>
      <aside className="review-boundary-note"><strong>Code-control boundary</strong><p>The option structure is implemented. Approval must resolve every selection through the exact licensed, owner-approved code edition, construction specification, material/filler catalogs, supporting PQR evidence, and independent welding authority. The builder never treats an illustrative catalog choice as code acceptance.</p></aside>
    </form>
  </section>;
}

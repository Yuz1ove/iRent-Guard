import type { ReturnCase } from "../types/assessment";

export const mockReturnCases: ReturnCase[] = [
  {
    id: "normal",
    scenarioName: "正常還車",
    orderId: "RT-260629-001",
    vehicleId: "IR-2038",
    vehicleType: "car",
    model: "Toyota Corolla Cross",
    location: "台北車站 B1",
    nextBookingMinutes: 80,
    photoFindings: [],
    voiceNote: "車況正常，內裝乾淨，已依指示停回原車位。",
    telematics: {
      batteryPercent: 78,
      tirePressureLow: false,
      dtcWarning: false,
      odometerDeltaKm: 21,
      locationConfidence: 0.96
    },
    history: {
      recentComplaints: 0,
      unresolvedWorkOrders: 0
    }
  },
  {
    id: "dirty",
    scenarioName: "車內髒污",
    orderId: "RT-260629-014",
    vehicleId: "IR-1186",
    vehicleType: "car",
    model: "Toyota Yaris",
    location: "信義松仁站",
    nextBookingMinutes: 95,
    photoFindings: ["trash", "spill"],
    voiceNote: "後座有飲料打翻，杯架旁邊有垃圾，車內看起來有點髒。",
    telematics: {
      batteryPercent: 54,
      tirePressureLow: false,
      dtcWarning: false,
      odometerDeltaKm: 12,
      locationConfidence: 0.91
    },
    history: {
      recentComplaints: 1,
      unresolvedWorkOrders: 0
    }
  },
  {
    id: "low-energy",
    scenarioName: "低電量/低油量",
    orderId: "RT-260629-027",
    vehicleId: "IR-4520",
    vehicleType: "car",
    model: "Toyota Prius PHV",
    location: "高雄巨蛋站",
    nextBookingMinutes: 90,
    photoFindings: [],
    voiceNote: "車況還可以，但電量偏低，下一位可能需要先充電。",
    telematics: {
      batteryPercent: 12,
      tirePressureLow: false,
      dtcWarning: false,
      odometerDeltaKm: 39,
      locationConfidence: 0.88
    },
    history: {
      recentComplaints: 0,
      unresolvedWorkOrders: 0
    }
  },
  {
    id: "scratch",
    scenarioName: "外觀刮傷",
    orderId: "RT-260629-033",
    vehicleId: "IR-7712",
    vehicleType: "car",
    model: "Toyota Altis",
    location: "台南小西門站",
    nextBookingMinutes: 120,
    photoFindings: ["scratch", "bumper"],
    voiceNote: "右前保險桿好像有刮傷，我不確定是不是原本就存在。",
    telematics: {
      batteryPercent: 64,
      tirePressureLow: false,
      dtcWarning: false,
      odometerDeltaKm: 17,
      locationConfidence: 0.92
    },
    history: {
      recentComplaints: 1,
      unresolvedWorkOrders: 0,
      repeatedDamageArea: "右前保險桿"
    }
  },
  {
    id: "tire",
    scenarioName: "胎壓異常",
    orderId: "RT-260629-041",
    vehicleId: "IR-5309",
    vehicleType: "car",
    model: "Toyota Sienta",
    location: "台中市政站",
    nextBookingMinutes: 75,
    photoFindings: [],
    voiceNote: "儀表上胎壓燈有亮，開起來感覺左後輪不太穩。",
    telematics: {
      batteryPercent: 71,
      tirePressureLow: true,
      dtcWarning: false,
      odometerDeltaKm: 26,
      locationConfidence: 0.94
    },
    history: {
      recentComplaints: 0,
      unresolvedWorkOrders: 0
    }
  },
  {
    id: "urgent-repair",
    scenarioName: "有下一筆訂單但需維修",
    orderId: "RT-260629-052",
    vehicleId: "IR-8826",
    vehicleType: "car",
    model: "Toyota RAV4",
    location: "新竹高鐵站",
    nextBookingMinutes: 35,
    photoFindings: ["dent"],
    voiceNote: "故障燈亮起，煞車時有聲音，下一位租客應該不要直接開走。",
    telematics: {
      batteryPercent: 43,
      tirePressureLow: false,
      dtcWarning: true,
      odometerDeltaKm: 44,
      locationConfidence: 0.9
    },
    history: {
      recentComplaints: 1,
      unresolvedWorkOrders: 1
    }
  },
  {
    id: "dispute",
    scenarioName: "客訴爭議高風險",
    orderId: "RT-260629-066",
    vehicleId: "IR-9164",
    vehicleType: "car",
    model: "Toyota Corolla Sport",
    location: "板橋車站",
    nextBookingMinutes: 55,
    photoFindings: ["scratch"],
    voiceNote: "我拿到車時就這樣了，不是我弄的，照片看起來原本就有刮傷。",
    telematics: {
      batteryPercent: 49,
      tirePressureLow: false,
      dtcWarning: false,
      odometerDeltaKm: 8,
      locationConfidence: 0.64
    },
    history: {
      recentComplaints: 3,
      unresolvedWorkOrders: 1,
      repeatedDamageArea: "左後車門"
    }
  }
];

export function getCaseById(id: string) {
  return mockReturnCases.find((item) => item.id === id) ?? mockReturnCases[0];
}

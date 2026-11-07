export interface Guide {
  title: string;
  description: string;
  kicker: string;
  sections: { heading: string; paragraphs: string[]; list?: string[] }[];
  sources: { label: string; href: string }[];
}

const disclaimer =
  "This is an educational summary of publicly available material. It is not legal advice, not an official notice, and not a quote from a live government system. Posted signs, your ticket, and the authority named on that ticket control. Figures and phone numbers change.";

export const guides: Record<string, Guide> = {
  speed: {
    title: "Ghana speed limits",
    description: "General speed limits from the Road Traffic Regulations, 2012, and why a posted sign still wins.",
    kicker: "Road",
    sources: [
      { label: "Ministry of Roads and Highways — Ghana Driver’s Guide (2022 PDF)", href: "https://mrh.gov.gh/wp-content/uploads/2022/09/Ghana-Drivers-Guide-_Final_Signed.pdf" },
      { label: "Road Traffic Regulations, 2012 (L.I. 2180), public commentary quoting regulation 3", href: "https://www.ashigbey.com/2014/12/16/road-traffic-regulations-2012-l-i-2180-beware-of-it-safe-lives-including-yours-save-cash/" },
    ],
    sections: [
      {
        heading: "The general bands",
        paragraphs: [
          disclaimer,
          "Where no sign says otherwise, public texts of the Road Traffic Regulations, 2012 (L.I. 2180) describe these maximums:",
        ],
        list: [
          "30 km/h where people gather: a school, playground, health facility, church, mosque, market, shopping centre, procession, or a place where human activity is predominant.",
          "50 km/h on a road in an urban or built-up area.",
          "90 km/h outside an urban or built-up area, other than a motorway.",
          "100 km/h on a motorway.",
        ],
      },
      {
        heading: "Signs, trucks, and later briefings",
        paragraphs: [
          "The regulation text says the Road Authority may indicate otherwise. A posted sign is the limit for that stretch.",
          "The Ministry driver’s guide also describes lower maximums for trucks: 75 km/h loaded and 80 km/h unloaded, in the summary published with that guide.",
          "NRSA officers have, in later public briefings, described 80 km/h on some highways and a lower cap for commercial drivers even on a motorway. Those statements do not all use the same numbers as the 2012 general bands. Nokware therefore does not pretend to hold a live legal feed. Select the sign you can see.",
          "Driving under the number is not a sport. The same public guidance says you should go slower when the road, the weather, or the people demand it.",
        ],
      },
    ],
  },
  traffitech: {
    title: "TraffiTech, from the outside",
    description: "What the Ghana Police Service publishes about TraffiTech-GH, and what Nokware refuses to imitate.",
    kicker: "External system",
    sources: [
      { label: "Ghana Police Service — TraffiTech-GH", href: "https://police.gov.gh/en/index.php/traffitech-gh/" },
      { label: "MTTD–TraffiTech payment portal", href: "https://traffitech-ghpay.nib.com.gh/" },
    ],
    sections: [
      {
        heading: "Not this product",
        paragraphs: [
          "TraffiTech-GH is the Ghana Police Service Motor Traffic and Transport Department’s electronic notice system. Nokware is not TraffiTech, is not the Police, and has no official connection to either.",
          disclaimer,
        ],
      },
      {
        heading: "What the Police page describes",
        paragraphs: [
          "The published FAQ describes an Electronic Notice of Violation, a 14-day window to pay or contest, evidence viewed with a ticket number on the NIB-hosted portal, payment by the portal or *710*0#, and a check of outstanding fines on *220# before a DVLA visit.",
          "It also describes a late addition of 1% of the fine per day after the 14-day period, and says DVLA will not renew a licence or process certain vehicle transactions while a fine is outstanding. Confirm that on the Police page before you rely on it.",
          "Official texts are described as coming from the sender GPS-MTTD, without clickable links and without a regular 10-digit mobile number. A message that asks you to pay a person is a reason to stop.",
        ],
      },
    ],
  },
  fines: {
    title: "Ghana traffic fines",
    description: "How publicly reported TraffiTech fine bands are structured, and why your notice is the amount that matters.",
    kicker: "Money",
    sources: [
      { label: "Ghana Police Service — TraffiTech-GH FAQ", href: "https://police.gov.gh/en/index.php/traffitech-gh/" },
      { label: "3News fact-check of published bands", href: "https://3news.com/news/traffitech-gh-fines-payment-codes-fact-check" },
    ],
    sections: [
      {
        heading: "Read the notice",
        paragraphs: [
          disclaimer,
          "Press reporting on Regulation 242 describes a graduated speeding schedule, with one penalty unit publicly treated as GH₵12: GH₵240 for 5–20 km/h over, then 300, 360, 420 and 480 as the excess rises. A separate GH₵120 scale is described for other automated offences, stepping up with repeats.",
          "Nokware’s calculator repeats those published bands and labels them as estimates. It will not invent a figure for a case the reports send to court. The number on your official notice is the one to pay.",
        ],
      },
    ],
  },
  compliance: {
    title: "Vehicle compliance",
    description: "Insurance, roadworthiness, registration and licence — what a driver keeps, and what Nokware will not pretend to verify.",
    kicker: "Vehicle",
    sources: [
      { label: "DVLA Ghana services", href: "https://www.dvla.gov.gh/services" },
      { label: "National Insurance Commission", href: "https://nicgh.org/" },
    ],
    sections: [
      {
        heading: "Four papers, four issuers",
        paragraphs: [
          disclaimer,
          "A car on a Ghanaian road is generally expected to have insurance, a roadworthiness certificate, and registration, and the driver is expected to hold a licence. Each comes from its own issuer. Nokware stores the dates you type and the files you upload. It does not verify them with DVLA, NIC, or an insurer.",
          "DVLA publishes that roadworthiness is examined at a testing station, with the vehicle and its registration documents. The certificate can be renewed from about a month before it expires. Confirm the current list on dvla.gov.gh before you travel.",
          "The National Insurance Commission has published a short code, *920*57#, for insurance checks. Use the insurer’s own document as well.",
        ],
      },
    ],
  },
  driver: {
    title: "Ghana driver guide",
    description: "A short, sourced orientation for everyday driving in Ghana.",
    kicker: "Guide",
    sources: [
      { label: "Ministry of Roads and Highways — Ghana Driver’s Guide", href: "https://mrh.gov.gh/wp-content/uploads/2022/09/Ghana-Drivers-Guide-_Final_Signed.pdf" },
    ],
    sections: [
      {
        heading: "What the public guide emphasises",
        paragraphs: [
          disclaimer,
          "The Ministry guide asks drivers to respect posted limits, rest before fatigue (including the published limits on continuous driving hours), carry warning devices, use seatbelts, and avoid drink, distraction and overload.",
          "Nokware’s job is the personal layer: is this car’s paperwork in date, is there a notice you imported, and was the last drive inside the limit you selected. It is not a replacement for the Highway Code or for a sign.",
        ],
      },
    ],
  },
  violation: {
    title: "Traffic violation guide",
    description: "A careful sequence when a notice arrives: read, confirm, pay or contest through the official path.",
    kicker: "Notice",
    sources: [
      { label: "Ghana Police Service — how to contest", href: "https://police.gov.gh/en/index.php/traffitech-gh/" },
      { label: "Graphic Online — pay or challenge", href: "https://www.graphic.com.gh/news/general-news/fined-by-traffitech-gh-heres-how-to-pay-or-challenge-it.html" },
    ],
    sections: [
      {
        heading: "A sequence that stays honest",
        paragraphs: [disclaimer],
        list: [
          "Keep the message. Do not tap a surprise link or pay a personal wallet.",
          "If it looks like TraffiTech, look up the ticket on the published portal and view the evidence there. Nokware cannot fetch that clip.",
          "Pay on the published portal or *710*0# if you accept the notice. Record the receipt in Nokware afterwards if you want the deadline to clear. That record is yours, not a Police confirmation.",
          "If you contest, the published path starts online within the window on the notice, then an appointment, then court. Nokware can organise your notes. It does not file them and it will not tell you that you will win.",
        ],
      },
    ],
  },
  roadworthiness: {
    title: "Ghana roadworthiness",
    description: "What a roadworthiness certificate is for, and why Nokware will not invent an inspection result.",
    kicker: "Vehicle",
    sources: [{ label: "DVLA Ghana services", href: "https://www.dvla.gov.gh/services" }],
    sections: [
      {
        heading: "An inspection, not a guess",
        paragraphs: [
          disclaimer,
          "DVLA publishes that roadworthiness is examined at a testing station, with the vehicle and its registration documents. The certificate can be renewed from about a month before it expires. Confirm the current steps on dvla.gov.gh.",
          "Nokware stores the expiry date you enter and reminds you as that date approaches. It does not book a test, and it does not mark a car roadworthy.",
        ],
      },
    ],
  },
  score: {
    title: "How the Nokware driver score is calculated",
    description: "A personal driving score from saved trips. It is not a government grade and not an insurance quote.",
    kicker: "Score",
    sources: [{ label: "Nokware", href: "/" }],
    sections: [
      {
        heading: "Only from recorded driving",
        paragraphs: [
          disclaimer,
          "The score appears after at least 30 minutes and 20 speed samples, using a limit you selected. The weights are speed compliance 30%, braking 20%, acceleration 20%, traffic compliance 15%, and consistency 15%.",
          "Cornering, road-risk exposure and a yearly window are not recorded, so they are not part of the number. A demonstration account is labelled demo and does not change a personal score.",
        ],
      },
    ],
  },
  safety: {
    title: "Driver safety score",
    description: "Why a safety number only means something when the inputs are real.",
    kicker: "Score",
    sources: [{ label: "Nokware driver score", href: "/ghana-driver-score" }],
    sections: [
      {
        heading: "No invented safety",
        paragraphs: [
          disclaimer,
          "Nokware’s driver health reading averages the driver score and the vehicle compliance figure when both exist. If either is missing, it says the reading is partial or that there are not enough records.",
          "It does not score cornering, flood exposure, or school zones. Those stay unrecorded until a feed provides them with a source and a time.",
        ],
      },
    ],
  },
  insurance: {
    title: "Insurance renewal",
    description: "How to keep an insurance date without treating Nokware as the insurer.",
    kicker: "Insurance",
    sources: [{ label: "National Insurance Commission", href: "https://nicgh.org/" }],
    sections: [
      {
        heading: "The certificate is the record",
        paragraphs: [
          disclaimer,
          "The National Insurance Commission has published *920*57# as a check. Use the insurer’s document as well. After a renewal, update the expiry date you saved. Nokware does not file the renewal and does not sell a policy.",
        ],
      },
    ],
  },
  fleet: {
    title: "Fleet compliance",
    description: "What a fleet view can say, and what it cannot pull from a registry.",
    kicker: "Fleet",
    sources: [{ label: "DVLA Ghana", href: "https://www.dvla.gov.gh/" }],
    sections: [
      {
        heading: "Drivers you add",
        paragraphs: [
          disclaimer,
          "A fleet score is the average of driver scores that already have enough saved driving. Empty drivers stay unscored. A sample fleet is labelled demo. Nokware is not connected to a government fleet register, and it does not forecast official inspections.",
        ],
      },
    ],
  },
  transfer: {
    title: "Vehicle transfer guide",
    description: "What to gather when a car changes hands, without pretending the form has been filed.",
    kicker: "Ownership",
    sources: [
      { label: "DVLA Ghana", href: "https://www.dvla.gov.gh/" },
      { label: "Ghana Police Service on DVLA blocks", href: "https://police.gov.gh/en/index.php/traffitech-gh/" },
    ],
    sections: [
      {
        heading: "Gather, then go to DVLA",
        paragraphs: [
          disclaimer,
          "A transfer is a DVLA process. Nokware’s checklist tracks whether you have a sale date, the buyer’s details, and an agreement. The ownership-record line stays “unknown” until you tell it you submitted the paperwork yourself.",
          "The Police FAQ says DVLA will not process a transfer while a TraffiTech fine on the vehicle is outstanding. Check *220# or the portal before you queue. Nokware cannot check it for you.",
        ],
      },
    ],
  },
};

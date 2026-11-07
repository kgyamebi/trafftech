export type DeskState = "available" | "partial" | "not_connected";

export interface DeskItem {
  group: string;
  name: string;
  state: DeskState;
  detail: string;
}

export function mapDesk(): DeskItem[] {
  return [
    { group: "Search", name: "Addresses, businesses and landmarks", state: "available", detail: "OpenStreetMap search for places in Ghana." },
    { group: "Search", name: "Coordinates", state: "available", detail: "Type a latitude and longitude in Ghana. The pin is named from those numbers." },
    { group: "Search", name: "Nearby categories", state: "available", detail: "Hospital, pharmacy, fuel, police, school, market, bank, restaurant, hotel, ATM, bus stop, train, parking, trotro, taxi rank, lorry station, rural hub, church, mobile money, shop and landmark. OpenStreetMap results are joined with places drivers have confirmed." },
    { group: "Search", name: "Ratings, price and hours filters", state: "not_connected", detail: "There is no review or price feed. Mapped opening hours show on a pin only when OpenStreetMap has them, and they are not a live open or closed status." },
    { group: "Search", name: "Popular destinations", state: "not_connected", detail: "Places are not ranked by popularity." },
    { group: "Search", name: "Ask Maps or Gemini", state: "not_connected", detail: "This map does not send questions to Gemini. Driver Intelligence answers from the records on the account." },
    { group: "Navigation", name: "Driving, walking and cycling", state: "available", detail: "Turn-by-turn guidance, alternate routes and voice use an OpenStreetMap route. Time is an estimate." },
    { group: "Navigation", name: "Motorcycle, scooter and public transport routes", state: "not_connected", detail: "Those profiles are not requested. A bus stop or station can still be searched as a place." },
    { group: "Navigation", name: "Lane guidance", state: "partial", detail: "A lane is spoken only when the route includes one. Otherwise lane guidance is not provided." },
    { group: "Navigation", name: "Speed limits", state: "partial", detail: "A limit appears only when OpenStreetMap mapped it, or when you set the sign you see. The posted sign controls." },
    { group: "Navigation", name: "Rerouting", state: "partial", detail: "The route is recalculated when the fix leaves it. That is not a traffic prediction." },
    { group: "Traffic", name: "Live traffic, incidents and closures", state: "not_connected", detail: "There is no congestion, incident, closure or traffic-colour layer. Estimated time is not a live travel time." },
    { group: "Traffic", name: "Speeds shared by drivers", state: "partial", detail: "A shared speed appears only when enough drivers have shared. Until then it stays unknown. This is not live traffic." },
    { group: "Traffic", name: "Community reports", state: "available", detail: "Accidents, closures, floods, works, potholes, broken signals, breakdowns, fuel prices and parking are driver reports. A confirmed report can be shown on the map. It does not reorder the route. Checkpoint locations are not collected." },
    { group: "Public transport", name: "Stops and stations", state: "partial", detail: "A nearby bus stop or train station can be found on OpenStreetMap." },
    { group: "Public transport", name: "Schedules, fares and payment", state: "not_connected", detail: "Departure boards and transit payment are not connected." },
    { group: "Offline", name: "Downloaded regions", state: "not_connected", detail: "Regions cannot be saved for offline search. A route you were looking at is kept on this phone for 6 hours, including after a reload." },
    { group: "Imagery", name: "Street-level imagery", state: "not_connected", detail: "There is no 360° street imagery, storefront photo or interior photo." },
    { group: "Imagery", name: "Satellite, terrain and elevation", state: "not_connected", detail: "The map is the OpenStreetMap road map. Elevation and topography are not connected." },
    { group: "Imagery", name: "Live view and indoor maps", state: "not_connected", detail: "Camera navigation, landmark identification and indoor floor plans are not connected." },
    { group: "Sharing", name: "Share a pin or an estimate", state: "available", detail: "You can share a place, the estimated time of a route you are looking at, or a drive already saved. The time is the moment you shared it, not a live arrival." },
    { group: "Sharing", name: "Live tracking of other people", state: "not_connected", detail: "Other people's locations are not followed." },
    { group: "Saved places", name: "Home, work, school and favourites", state: "available", detail: "Places you save on this account. The demo cannot store places." },
    { group: "Saved places", name: "Shared lists", state: "not_connected", detail: "Lists are not shared with other accounts." },
    { group: "Places", name: "Reviews, photos and Local Guides", state: "not_connected", detail: "Nokware does not collect ratings, reviews, photos or contribution points." },
    { group: "Places", name: "Phone, website and mapped hours", state: "available", detail: "OpenStreetMap phone, website and hours show when the map has them. A driver can also enter a phone and hours on a place. Hours are not a live open or closed status. Menus, busy times, reservations and bookings are not connected." },
    { group: "Trips", name: "One destination and saved drives", state: "available", detail: "Routes are ordered by estimated time, then distance. A saved drive can be reviewed and shared. A fuel figure appears only from the consumption and price you type." },
    { group: "Trips", name: "Multi-stop, parking availability and traffic prediction", state: "not_connected", detail: "A route has one destination and its order does not change for a report. A parking note is what a driver saw, not a live count of spaces. A speed on Local roads is calculated only where enough drivers have shared." },
    { group: "Measure", name: "Distance between two taps", state: "available", detail: "The distance is a straight line between the two points you tap. It is not a driving route." },
    { group: "Environment", name: "Eco routing and air quality", state: "not_connected", detail: "Routes are not reordered for fuel or air quality. There is no air-quality layer." },
    { group: "Devices", name: "Phone browser", state: "available", detail: "The map runs in the phone browser, including voice you chose for warnings and directions." },
    { group: "Devices", name: "Watches, Android Auto and CarPlay", state: "not_connected", detail: "Those vehicle and watch screens are not connected." },
    { group: "Other", name: "Crisis alerts, ride-hailing and visual search", state: "not_connected", detail: "Disaster alerts, ride booking, camera search and planet imagery are not connected." },
  ];
}

# Realtime Socket Contract

## Socket URL

- Local: `http://localhost:8080`
- Path: Socket.IO default path `/socket.io`
- Namespace: default namespace

## Auth Method

The gateway requires an access token during connection.

Supported token transport:

```js
io("http://localhost:8080", {
  auth: { token: accessToken },
});
```

or:

```js
io("http://localhost:8080", {
  extraHeaders: { Authorization: `Bearer ${accessToken}` },
});
```

Token type determines the default room:

- Admin access token joins `admins`.
- Customer access token joins `customers` and `customer:{customerId}`.
- Screen access token joins `screens`.

Invalid, expired, blocked, inactive, or revoked tokens are disconnected.

## Rooms

Customer rooms:

- `customers`: authenticated customer apps receive marketplace and auction refresh hints.
- `customer:{customerId}`: private customer events such as notifications and own order item updates.

Admin rooms:

- `admins`: admin app receives product, auction, sale, label, and shipping updates.

Screen rooms:

- `screens`: active screen devices receive display-oriented sale/session events.
- Screens also support `join_screen_room`; active screen tokens already join `screens` on connect.

## Events

### `product_sold`

Emitted after `POST /api/products/{id}/buy` succeeds.

Rooms:

- `admins`
- `customers`

Payload example:

```json
{
  "productId": "product_123",
  "customerId": "customer_123",
  "orderItemId": "item_123",
  "soldAt": "2026-07-13T12:00:00.000Z"
}
```

Refresh:

- Customer app: `GET /api/products` or `GET /api/products/{id}`.
- Admin app: `GET /api/admin/products/{id}`.

### `auction_updated`

Emitted after auction publish/cancel and after a successful bid.

Rooms:

- `admins`
- `customers`

Payload example:

```json
{
  "id": "auction_123",
  "title": "Auction item",
  "status": "ACTIVE",
  "currentPrice": "1500.00",
  "minimumNextBid": "2000.00",
  "endsAt": "2026-07-13T12:05:00.000Z",
  "serverTime": "2026-07-13T12:00:00.000Z",
  "isLive": true,
  "isEnded": false,
  "totalBids": 3
}
```

Refresh:

- Customer app: `GET /api/auctions/{id}`.
- Admin app: `GET /api/admin/auctions/{id}` or `GET /api/admin/auctions/{id}/bids`.

### `auction_closed`

Emitted after scheduled close or `POST /api/admin/auctions/{id}/close-now`.

Rooms:

- `admins`
- `customers`

Payload example:

```json
{
  "id": "auction_123",
  "status": "ENDED",
  "winnerCustomerId": "customer_123",
  "currentPrice": "2500.00",
  "endsAt": "2026-07-13T12:05:00.000Z",
  "serverTime": "2026-07-13T12:05:01.000Z",
  "isEnded": true
}
```

Refresh:

- Customer app: `GET /api/auctions/{id}` and `GET /api/notifications`.
- Admin app: `GET /api/admin/auctions/{id}` and `GET /api/admin/auctions/{id}/bids`.

### `notification`

Emitted when a customer notification is created and allowed by that customer's settings.

Room:

- `customer:{customerId}`

Payload example:

```json
{
  "id": "notification_123",
  "title": "You were outbid",
  "body": "Auction item",
  "type": "BID_OUTBID",
  "isRead": false,
  "createdAt": "2026-07-13T12:00:00.000Z",
  "metadata": {
    "auctionId": "auction_123",
    "bidId": "bid_456"
  }
}
```

Refresh:

- Customer app: `GET /api/notifications`.
- Customer unread badge: `GET /api/notifications/unread-count`.

The notification event is a minimal refresh hint. Existing single-recipient events may contain `notificationId`, `type`, and `createdAt`; admin campaigns contain `campaignId` and `refresh: true`. REST remains the source of truth, and clients must refresh the notification list/unread count instead of treating socket payloads as authoritative.

Live-session realtime events are decommissioned and are not emitted by the current product.

### `order_item_sold`

Emitted after quick sale, product purchase, or auction close creates order items.

Rooms:

- `admins`
- `customer:{customerId}` when a customer id is available

Payload example:

```json
{
  "itemId": "item_123",
  "barcode": "ITEM-20260713-A8K2M9",
  "customerName": "Ahmed",
  "price": 15000,
  "currency": "IQD",
  "source": "APP_FIXED_PRICE",
  "soldAt": "2026-07-13T12:00:00.000Z"
}
```

Refresh:

- Customer app: `GET /api/customer/order-items` or `GET /api/customer/box`.
- Admin app: `GET /api/admin/warehouse/label-pending`.

### `last_sale_updated`

Emitted after a sale for admin dashboards and screens.

Rooms:

- `admins`
- `screens`

Payload: same sale payload shape as `order_item_sold`.

Refresh:

- Admin app: `GET /api/admin/dashboard/stats`.
- Screen app: refresh its current display state, if any.

### `label_job_updated`

Emitted after label job state changes.

Room:

- `admins`

Payload example:

```json
{
  "jobId": "label_job_123",
  "orderItemId": "item_123",
  "status": "PRINTED"
}
```

Refresh:

- Admin app: `GET /api/admin/labels/jobs` or `GET /api/admin/warehouse/label-pending`.

## Other Current Events

The backend also emits these admin/screen events:

- `shipping_request_created`
- `shipment_updated`
- `session_updated`
- `session_ended`

Mobile Phase C should not make winner decisions from socket payloads. Countdown and winning/outbid UI should always refresh from REST responses that include backend `serverTime`.

## Phase E security refresh events

Authenticated admin clients in the `admins` room may receive these minimal refresh hints:

- `staff_updated`: `{ "staffId": "..." }`
- `staff_status_changed`: `{ "staffId": "...", "status": "ACTIVE|INACTIVE|LOCKED" }`
- `staff_access_changed`: `{ "staffId": "..." }`
- `staff_session_revoked`: `{ "staffId": "...", "sessionId": "...", "all": false }`
- `role_updated`: `{ "roleId": "..." }`

These events contain identifiers and status only. They never contain permissions, passwords, tokens, hashes, or authorization headers. REST remains the source of truth; the Admin App should refresh `/api/admin/auth/me`, staff details, or role details after receiving a hint. Status changes and session revocations should force the affected client to disconnect or re-authenticate where possible.

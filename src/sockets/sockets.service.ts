import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

export type RealtimeEvent =
  | 'last_sale_updated'
  | 'order_item_sold'
  | 'order_updated'
  | 'product_sold'
  | 'auction_updated'
  | 'auction_closed'
  | 'notification'
  | 'label_job_updated'
  | 'shipping_request_created'
  | 'shipment_updated'
  | 'session_updated'
  | 'session_ended'
  | 'staff_updated'
  | 'staff_status_changed'
  | 'staff_access_changed'
  | 'staff_session_revoked'
  | 'role_updated'
  | 'quick_sale_display_updated';

@Injectable()
export class SocketsService {
  private server?: Server;

  bindServer(server: Server) {
    this.server = server;
  }

  emitToAdmins(event: RealtimeEvent, payload: unknown) {
    this.server?.to('admins').emit(event, payload);
  }

  emitToScreens(event: RealtimeEvent, payload: unknown) {
    this.server?.to('screens').emit(event, payload);
  }

  emitToCustomers(event: RealtimeEvent, payload: unknown) {
    this.server?.to('customers').emit(event, payload);
  }

  emitToCustomer(customerId: string, event: RealtimeEvent, payload: unknown) {
    this.server?.to(`customer:${customerId}`).emit(event, payload);
  }

  emitNotificationRefresh(customerIds: string[], campaignId: string) {
    if (customerIds.length === 0) return;
    this.server
      ?.to(customerIds.map((customerId) => `customer:${customerId}`))
      .emit('notification', { campaignId, refresh: true });
  }

  emitSale(payload: unknown, customerId?: string) {
    this.emitToAdmins('order_item_sold', payload);
    this.emitToAdmins('last_sale_updated', payload);
    if (customerId) {
      this.emitToCustomer(customerId, 'order_item_sold', payload);
    }
  }

  emitQuickSaleDisplayUpdated(recordId: string) {
    this.emitToScreens('quick_sale_display_updated', { refresh: true, recordId });
  }

  disconnectScreen(screenId: string) {
    this.server?.in(`screen:${screenId}`).disconnectSockets(true);
  }

  emitLabelJobUpdated(payload: unknown) {
    this.emitToAdmins('label_job_updated', payload);
  }

  emitSessionUpdated(payload: unknown) {
    this.emitToAdmins('session_updated', payload);
    this.emitToScreens('session_updated', payload);
  }

  emitSessionEnded(payload: unknown) {
    this.emitToAdmins('session_ended', payload);
    this.emitToScreens('session_ended', payload);
  }
}

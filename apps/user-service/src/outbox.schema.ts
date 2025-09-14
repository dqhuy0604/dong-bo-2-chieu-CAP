import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OutboxEventDocument = OutboxEvent & Document;

@Schema({ collection: 'outbox_events' })
export class OutboxEvent {
    @Prop({ required: true, unique: true })
    eventId: string;

    @Prop({ required: true })
    entity: string;

    @Prop({ required: true, enum: ['create', 'update', 'delete'] })
    op: 'create' | 'update' | 'delete';

    @Prop({ required: true })
    id: string;

    @Prop({ type: Object })
    data: any;

    @Prop({ required: true })
    updatedAt: number;

    @Prop({ required: true })
    version: number;

    @Prop({ required: true, enum: ['mongo', 'redis'] })
    source: 'mongo' | 'redis';

    @Prop({ required: true, enum: ['pending', 'sent', 'failed'], default: 'pending' })
    status: 'pending' | 'sent' | 'failed';

    @Prop({ required: true, default: 0 })
    retryCount: number;

    @Prop({ required: true, default: Date.now })
    createdAt: Date;

    @Prop()
    lastAttemptAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

OutboxEventSchema.index({ eventId: 1 }, { unique: true });

OutboxEventSchema.index({ status: 1, createdAt: 1 });
OutboxEventSchema.index({ status: 1, retryCount: 1 });


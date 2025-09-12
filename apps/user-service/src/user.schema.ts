import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: false, versionKey: false })
export class User {
    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    updatedAt: number; // epoch millis for LWW

    @Prop({ required: true, enum: ['mongo', 'redis'] })
    source: 'mongo' | 'redis';

    @Prop({ required: true, default: 0 })
    version: number;
}

export const UserSchema = SchemaFactory.createForClass(User);


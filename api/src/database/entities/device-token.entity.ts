import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DevicePlatform = 'android' | 'ios' | 'web';
export type DeviceApp = 'customer' | 'rider' | 'web';

/** An FCM registration token for one installed app on one device. */
@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId: string;

  /** Denormalised so role-wide broadcasts need no join. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  role: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  token: string;

  @Column({ type: 'varchar', length: 10, default: 'android' })
  platform: DevicePlatform;

  @Column({ type: 'varchar', length: 10, default: 'customer' })
  app: DeviceApp;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

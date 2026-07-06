import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numeric } from '../common/numeric.transformer';
import { User } from './user.entity';

/** A customer delivery address (Kinshasa zones + geo, mirrors the app model). */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ default: 'Home' })
  label: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'text' })
  line: string;

  @Column({ default: 'Kinshasa' })
  city: string;

  @Column({ default: 'Gombe' })
  zone: string;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: -4.325, transformer: numeric })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 15.322, transformer: numeric })
  lng: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

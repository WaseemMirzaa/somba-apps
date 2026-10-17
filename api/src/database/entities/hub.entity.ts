import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hubs')
export class Hub {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'int', default: 500 })
  capacity: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address: string | null;

  /** Inactive hubs stay in the directory but cannot take new transfers. */
  @Column({ type: 'boolean', default: true })
  active: boolean;
}

# Clip R4 - a transfer run card: Loaded, On the road, handed over, then Done.
act riderClear
act rFixture stage=transfer commune=Masina pay=wallet product=Instant -> ord
include rsetup.sc
flash
say "A parcel for Masina must travel to Entrepôt Limete, which serves that area||Un colis pour Masina doit aller à l'Entrepôt Limete, qui dessert cette zone" 3.8
act runCreate -> run
wait 1.6
say "The desk groups it in a transfer run for Jean: the run card appears, Loaded||Le bureau le range dans une tournée de transfert pour Jean : la carte apparaît, Chargée" 4
tap "textc:Parcels||textc:Colis" 1.4
say "The parcel list of the run||La liste des colis de la tournée" 2.6
tap msg:act_run_on_road 1.8
say "On the road: the live position is shared with the warehouses||En route : la position en direct est partagée avec les entrepôts" 3.4
act runReceive
wait 2.4
say "Entrepôt Limete scans the run in: handed over||L'Entrepôt Limete réceptionne la tournée : remise effectuée" 3.2
tap key:tab-1 1.6
say "The run is Done: every parcel scanned in||La tournée est terminée : tous les colis sont réceptionnés" 3.2
wait 1

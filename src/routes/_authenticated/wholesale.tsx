import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { toast } from "sonner";

import {
  Plus,
  Trash2,
  Eye,
  Pencil,
  Printer
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/wholesale")({
  head: () => ({
    meta: [{ title: "Wholesale · Project Phoenix" }]
  }),
  component: WholesalePage,
});



type Invoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: string;
  total: number;
  amount_paid: number;
  customer_name: string | null;
  shopkeeper: {
    name:string
  } | null;
};



function WholesalePage(){

const qc = useQueryClient();


const [selectedInvoice,setSelectedInvoice] =
useState<Invoice | null>(null);


const [viewOpen,setViewOpen] =
useState(false);



const [editOpen,setEditOpen] =
useState(false);





const {data=[]}=useQuery({

queryKey:["invoices"],

queryFn:async()=>{


const {data,error}=await supabase
.from("invoices")
.select(`
id,
invoice_no,
invoice_date,
status,
total,
amount_paid,
customer_name,
shopkeeper:shopkeepers(name)
`)
.order("invoice_date",{ascending:false});


if(error) throw error;


return data as unknown as Invoice[];


}

});






const flat = useMemo(()=>


data.map((r)=>({

...r,

buyer:
r.shopkeeper?.name ??
r.customer_name ??
"Walk-in"

})),

[data]

);






const deleteInvoice = useMutation({

mutationFn:async(id:string)=>{


// delete items first

const {error:itemError}=await supabase
.from("invoice_items")
.delete()
.eq("invoice_id",id);


if(itemError)
throw itemError;



const {error}=await supabase
.from("invoices")
.delete()
.eq("id",id);



if(error)
throw error;



},


onSuccess:()=>{


toast.success("Invoice deleted");


qc.invalidateQueries({
queryKey:["invoices"]
});


},


onError:()=>{

toast.error("Delete failed");

}

});






const printInvoice=(invoice:Invoice)=>{


setSelectedInvoice(invoice);


// temporary thermal print

setTimeout(()=>{

window.print();

},300);


};








return (

<AppShell
title="Wholesale"
subtitle="Invoicing & Sales"
>


<div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">



<DataTable

rows={flat}

rowKey={(r)=>r.id}

searchKeys={[
"invoice_no",
"buyer"
]}

searchPlaceholder="Search invoice or customer…"



initialSort={{
key:"invoice_date",
dir:"desc"
}}



actions={

<NewInvoiceDialog

onCreated={()=>{

qc.invalidateQueries({
queryKey:["invoices"]
});


qc.invalidateQueries({
queryKey:["dashboard-stats"]
});


}}

/>

}




emptyMessage="No invoices yet."



columns={[



{
key:"invoice_no",

label:"Invoice #",

render:(r)=>(

<span className="font-mono text-[12px] font-semibold">

{r.invoice_no}

</span>

)

},



{
key:"buyer",

label:"Customer"

},



{
key:"invoice_date",

label:"Date",

align:"right",

render:(r)=>fmtDate(r.invoice_date)

},




{
key:"total",

label:"Total",

align:"right",

render:(r)=>

<span className="font-semibold">

{fmtRs(r.total)}

</span>


},




{
key:"amount_paid",

label:"Paid",

align:"right",

render:(r)=>

fmtRs(r.amount_paid)

},






{
key:"status",

label:"Status",

render:(r)=>(


<span
className={`
rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize

${
r.status==="paid"
?
"bg-success-soft text-success"

:

r.status==="partial"

?
"bg-warning-soft text-warning"

:

r.status==="credit"

?
"bg-primary-soft text-primary"

:
"bg-muted text-muted-foreground"

}

`}
>

{r.status}

</span>


)

},






{
key:"actions",

label:"Actions",

render:(r)=>(


<div className="flex gap-2">



<Button

size="icon"

variant="outline"

onClick={()=>{

setSelectedInvoice(r);

setViewOpen(true);

}}

>

<Eye size={16}/>

</Button>






<Button

size="icon"

variant="outline"

onClick={()=>{

setSelectedInvoice(r);

setEditOpen(true);

}}

>

<Pencil size={16}/>

</Button>






<Button

size="icon"

variant="outline"

onClick={()=>printInvoice(r)}

>

<Printer size={16}/>

</Button>







<Button

size="icon"

variant="destructive"

onClick={()=>{


if(
confirm("Delete this invoice?")
)

deleteInvoice.mutate(r.id);


}}

>

<Trash2 size={16}/>

</Button>




</div>


)

}



]}


/>



</div>





<ViewInvoiceDialog

invoice={selectedInvoice}

open={viewOpen}

setOpen={setViewOpen}

/>





</AppShell>

);

}







function ViewInvoiceDialog({

invoice,

open,

setOpen

}:{

invoice:Invoice|null;

open:boolean;

setOpen:(v:boolean)=>void;

}){


if(!invoice)
return null;



return (

<Dialog open={open} onOpenChange={setOpen}>


<DialogContent>


<DialogHeader>

<DialogTitle>

Invoice Details

</DialogTitle>

</DialogHeader>



<div className="space-y-3">


<p>
Invoice:
<b> {invoice.invoice_no}</b>
</p>


<p>
Customer:
<b>
{
invoice.shopkeeper?.name ??
invoice.customer_name ??
"Walk-in"
}
</b>
</p>


<p>
Total:
<b>
{fmtRs(invoice.total)}
</b>
</p>


<p>
Paid:
<b>
{fmtRs(invoice.amount_paid)}
</b>
</p>


<p>
Status:
<b>
{invoice.status}
</b>
</p>



</div>



<DialogFooter>

<Button onClick={()=>setOpen(false)}>
Close
</Button>

</DialogFooter>


</DialogContent>


</Dialog>

);

}type LineItem = {
  product_id:string;
  quantity:string;
  unit_price:string;
};



function EditInvoiceDialog({

invoice,

open,

setOpen,

onUpdated

}:{

invoice:Invoice|null;

open:boolean;

setOpen:(v:boolean)=>void;

onUpdated:()=>void;

}){


const [amountPaid,setAmountPaid]=useState("");

const [items,setItems]=useState<LineItem[]>([]);



const products = useQuery({

queryKey:["products-select-edit"],

queryFn:async()=>{

const {data,error}=await supabase
.from("products")
.select(`
id,
code,
name,
wholesale_price
`)
.eq("is_active",true)
.order("name");


if(error) throw error;

return data ?? [];

},

enabled:open

});





useQuery({

queryKey:["invoice-items",invoice?.id],

enabled:!!invoice && open,

queryFn:async()=>{


const {data,error}=await supabase

.from("invoice_items")

.select(`
product_id,
quantity,
unit_price
`)

.eq("invoice_id",invoice!.id);



if(error) throw error;


setItems(

(data ?? []).map((i)=>({

product_id:i.product_id,

quantity:String(i.quantity),

unit_price:String(i.unit_price)

}))

);


setAmountPaid(
String(invoice?.amount_paid ?? 0)
);


return data;


}

});





const updateInvoice = useMutation({

mutationFn:async()=>{


if(!invoice)
return;



const subtotal = items.reduce(

(sum,i)=>

sum +

Number(i.quantity)*Number(i.unit_price)

,0);



const paid=Number(amountPaid);



const status =

paid >= subtotal

?

"paid"

:

paid>0

?

"partial"

:

"credit";






await supabase

.from("invoices")

.update({

subtotal,

total:subtotal,

amount_paid:paid,

status

})

.eq("id",invoice.id);





await supabase

.from("invoice_items")

.delete()

.eq("invoice_id",invoice.id);





await supabase

.from("invoice_items")

.insert(

items.map(i=>({

invoice_id:invoice.id,

product_id:i.product_id,

quantity:Number(i.quantity),

unit_price:Number(i.unit_price),

subtotal:
Number(i.quantity)*Number(i.unit_price)

}))

);





},


onSuccess:()=>{


toast.success("Invoice updated");

setOpen(false);

onUpdated();


},



onError:()=>toast.error("Update failed")


});





if(!invoice)
return null;



return (

<Dialog

open={open}

onOpenChange={setOpen}

>


<DialogContent className="max-w-4xl">


<DialogHeader>

<DialogTitle>

Edit Invoice {invoice.invoice_no}

</DialogTitle>

</DialogHeader>



<div className="space-y-3">



{items.map((item,index)=>(


<div

key={index}

className="grid grid-cols-3 gap-3"

>


<select

className="border rounded p-2"

value={item.product_id}

onChange={(e)=>{

setItems(prev=>

prev.map((x,i)=>

i===index

?

{
...x,
product_id:e.target.value
}

:

x

)

)

}}

>


<option value="">

Select Product

</option>


{products.data?.map(p=>(

<option

key={p.id}

value={p.id}

>

{p.code} - {p.name}

</option>

))}


</select>




<input

className="border rounded p-2"

type="number"

value={item.quantity}

onChange={(e)=>

setItems(prev=>

prev.map((x,i)=>

i===index

?

{
...x,
quantity:e.target.value
}

:

x

)

)

}

/>



<input

className="border rounded p-2"

type="number"

value={item.unit_price}

onChange={(e)=>

setItems(prev=>

prev.map((x,i)=>

i===index

?

{
...x,
unit_price:e.target.value
}

:

x

)

)

}

/>



</div>


))}



<Button

variant="outline"

onClick={()=>setItems(prev=>[

...prev,

{
product_id:"",
quantity:"1",
unit_price:"0"
}

])}

>

Add Item

</Button>




<Input

type="number"

placeholder="Paid Amount"

value={amountPaid}

onChange={(e)=>

setAmountPaid(e.target.value)

}

/>



</div>




<DialogFooter>


<Button

onClick={()=>updateInvoice.mutate()}

>

Save Changes

</Button>


</DialogFooter>


</DialogContent>


</Dialog>

);


}
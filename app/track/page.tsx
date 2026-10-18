import OrderLookup from '../account/order-lookup';
export const metadata={title:'Track your order | Lityfied',description:'Check your order and shipment status with your order reference and checkout email.'};
export default function TrackOrder(){return <main className="accountPage"><a href="/" className="backLink">← Continue shopping</a><section className="accountCard"><h1>Track your order</h1><p>Enter your order number or checkout reference and the email used at checkout.</p><OrderLookup/></section></main>}
